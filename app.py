from flask import Flask, render_template, request, jsonify, session, send_file
from waitress import serve
import json
import os
import toml
from datetime import datetime
from metadata_extractor import extract_og_metadata
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'thrash_metal_rules_666'

DATA_DIR = 'data'
ALBUMS_FILE = os.path.join(DATA_DIR, 'albums.json')
GIGS_FILE = os.path.join(DATA_DIR, 'gigs.json')
os.makedirs(DATA_DIR, exist_ok=True)

def check_daily_limit(items_list, username, limit=50):
    """Devuelve True si el usuario ha superado el límite diario"""
    today_str = datetime.now().isoformat()[:10] # Ej: '2026-03-28'
    count = 0
    for item in items_list:
        if item.get('author') == username:
            item_date = item.get('timestamp', '')[:10]
            if item_date == today_str:
                count += 1
    return count >= limit

def load_json(filepath):
    if not os.path.exists(filepath) or os.stat(filepath).st_size == 0: return []
    try:
        with open(filepath, 'r', encoding='utf-8') as f: return json.load(f)
    except json.JSONDecodeError:
        return []

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)

def get_users():
    return toml.load('users.toml')

@app.route('/')
def index():
    return render_template('index.html')

# --- AUTH API ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    users = get_users()
    username = data.get('username')
    password = data.get('password')
    if username in users and users[username]['password'] == password:
        session['username'] = username
        session['role'] = users[username]['role']
        return jsonify({"success": True, "username": username, "role": session['role']})
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route('/api/auth/me', methods=['GET'])
def me():
    if 'username' in session: return jsonify({"username": session['username'], "role": session.get('role', 'user')})
    return jsonify({"error": "Not logged in"}), 401

# --- RECORDS API ---
@app.route('/api/albums', methods=['GET'])
def get_albums():
    return jsonify(load_json(ALBUMS_FILE))

@app.route('/api/albums/extract', methods=['POST'])
def extract_meta():
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    url = request.json.get('url')
    data = extract_og_metadata(url)
    if "error" in data: return jsonify(data), 400
    return jsonify(data)

@app.route('/api/albums', methods=['POST'])
def add_album():
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    albums = load_json(ALBUMS_FILE)
    
    # --- NUEVA LÍNEA: Comprobar límite diario ---
    if check_daily_limit(albums, session['username']):
        return jsonify({"error": "Daily limit reached. You can only post 10 records per day! 🤘"}), 403

    # 1. Comprobar si ya existe el disco (Case-insensitive)
    artist_lower = data['artist'].lower().strip()
    album_lower = data['album'].lower().strip()
    
    for a in albums:
        if a['artist'].lower().strip() == artist_lower and a['album'].lower().strip() == album_lower:
            merged = False
            # Añadir nuevos links sin borrar los que ya estaban
            for plat, url in data['links'].items():
                if plat not in a['links'] or a['links'][plat] != url:
                    a['links'][plat] = url
                    merged = True
            
            # Gestionar la co-autoría
            if session['username'] != a['author']:
                if 'co_authors' not in a:
                    a['co_authors'] = []
                if session['username'] not in a['co_authors']:
                    a['co_authors'].append(session['username'])
                    merged = True
                    
            if merged:
                save_json(ALBUMS_FILE, albums)
            return jsonify({"success": True, "album": a, "message": "Record merged!"})

    # 2. Si no existe, creamos el registro nuevo
    new_album = {
        "id": int(datetime.now().timestamp() * 1000),
        "author": session['username'],
        "co_authors": [], # Nuevo campo preparado
        "artist": data['artist'],
        "album": data['album'],
        "year": data.get('year', ''),
        "tags": data.get('tags', []),
        "cover_url": data.get('cover_url', ''),
        "links": data['links'],
        "likes": [],
        "timestamp": datetime.now().isoformat()
    }
    albums.insert(0, new_album)
    save_json(ALBUMS_FILE, albums)
    return jsonify({"success": True, "album": new_album})

@app.route('/api/albums/<int:album_id>', methods=['PUT'])
def edit_album(album_id):
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    albums = load_json(ALBUMS_FILE)
    for a in albums:
        if a['id'] == album_id and (a['author'] == session['username'] or session.get('role') == 'admin'):
            a['artist'] = data.get('artist', a['artist'])
            a['album'] = data.get('album', a['album'])
            a['year'] = data.get('year', a['year'])
            a['cover_url'] = data.get('cover_url', a['cover_url'])
            a['tags'] = data.get('tags', a['tags'])
            a['links'] = data.get('links', a['links'])
            save_json(ALBUMS_FILE, albums)
            return jsonify({"success": True})
    return jsonify({"error": "Unauthorized or not found"}), 403

@app.route('/api/albums/<int:album_id>/like', methods=['POST'])
def like_album(album_id):
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    albums = load_json(ALBUMS_FILE)
    user = session['username']
    for a in albums:
        if a['id'] == album_id:
            if user in a['likes']: a['likes'].remove(user)
            else: a['likes'].append(user)
            save_json(ALBUMS_FILE, albums)
            return jsonify({"success": True, "likes": a['likes']})
    return jsonify({"error": "Record not found"}), 404

@app.route('/api/albums/<int:album_id>', methods=['DELETE'])
def delete_album(album_id):
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    albums = load_json(ALBUMS_FILE)
    album = next((a for a in albums if a['id'] == album_id), None)
    if album and (album['author'] == session['username'] or session.get('role') == 'admin'):
        albums = [a for a in albums if a['id'] != album_id]
        save_json(ALBUMS_FILE, albums)
        return jsonify({"success": True})
    return jsonify({"error": "Unauthorized"}), 403

# --- GIGS API ---
@app.route('/api/gigs', methods=['GET'])
def get_gigs():
    gigs = load_json(GIGS_FILE)
    return jsonify(sorted(gigs, key=lambda x: x['date']))

@app.route('/api/gigs', methods=['POST'])
def add_gig():
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    gigs = load_json(GIGS_FILE)
    # --- NUEVA LÍNEA: Comprobar límite diario ---
    if check_daily_limit(gigs, session['username']):
        return jsonify({"error": "Daily limit reached. You can only post 10 gigs per day! 🤘"}), 403
    new_gig = {
        "id": int(datetime.now().timestamp() * 1000),
        "author": session['username'],
        "type": data.get('type', 'Gig'),
        "date": data['date'],
        "end_date": data.get('end_date', ''),
        "bands": data['bands'],
        "venue": data['venue'],
        "city": data['city'],
        "country": data['country'],
        "extra_info": data.get('extra_info', ''),
        "ticket_url": data.get('ticket_url', ''),
        "timestamp": datetime.now().isoformat()
    }
    gigs.append(new_gig)
    save_json(GIGS_FILE, gigs)
    return jsonify({"success": True})

@app.route('/api/gigs/<int:gig_id>', methods=['PUT'])
def edit_gig(gig_id):
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    gigs = load_json(GIGS_FILE)
    for g in gigs:
        if g['id'] == gig_id and (g['author'] == session['username'] or session.get('role') == 'admin'):
            g['bands'] = data.get('bands', g['bands'])
            g['date'] = data.get('date', g['date'])
            g['end_date'] = data.get('end_date', g['end_date'])
            g['venue'] = data.get('venue', g['venue'])
            g['city'] = data.get('city', g['city'])
            g['country'] = data.get('country', g['country'])
            g['ticket_url'] = data.get('ticket_url', g['ticket_url'])
            g['extra_info'] = data.get('extra_info', g['extra_info'])
            save_json(GIGS_FILE, gigs)
            return jsonify({"success": True})
    return jsonify({"error": "Unauthorized or not found"}), 403

@app.route('/api/gigs/<int:gig_id>', methods=['DELETE'])
def delete_gig(gig_id):
    if 'username' not in session: return jsonify({"error": "Unauthorized"}), 401
    gigs = load_json(GIGS_FILE)
    gig = next((g for g in gigs if g['id'] == gig_id), None)
    if gig and (gig['author'] == session['username'] or session.get('role') == 'admin'):
        gigs = [g for g in gigs if g['id'] != gig_id]
        save_json(GIGS_FILE, gigs)
        return jsonify({"success": True})
    return jsonify({"error": "Unauthorized"}), 403

# --- ADMIN API ---
@app.route('/api/admin/export', methods=['GET'])
def export_db():
    if session.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403
    export_data = {"albums": load_json(ALBUMS_FILE), "gigs": load_json(GIGS_FILE)}
    temp_file = os.path.join(DATA_DIR, 'backup.json')
    save_json(temp_file, export_data)
    return send_file(temp_file, as_attachment=True, download_name=f'metaller_backup_{datetime.now().strftime("%Y%m%d")}.json')

@app.route('/api/admin/import', methods=['POST'])
def import_db():
    if session.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403
    file = request.files.get('file')
    if not file: return jsonify({"error": "No file uploaded"}), 400
    try:
        data = json.load(file)
        if 'albums' in data and 'gigs' in data:
            save_json(ALBUMS_FILE, data['albums'])
            save_json(GIGS_FILE, data['gigs'])
            return jsonify({"success": True})
        return jsonify({"error": "Invalid JSON structure"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    print("Starting Metaller Vault...")
    serve(app, host='0.0.0.0', port=8080)