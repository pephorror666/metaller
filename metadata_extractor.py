import re
import requests
from bs4 import BeautifulSoup
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import os

# ==========================================
# API CONFIGURATION
# ==========================================
# Mantengo tus credenciales actuales
SPOTIPY_CLIENT_ID = os.environ.get('SPOTIPY_CLIENT_ID', 'tu_clave_local_solo_para_pruebas')
SPOTIPY_CLIENT_SECRET = os.environ.get('SPOTIPY_CLIENT_SECRET', 'tu_clave_local')

ALLOWED_DOMAINS = [
    'spotify.com', 'bandcamp.com', 'tidal.com', 'music.apple.com', 
    'deezer.com', 'youtube.com', 'youtu.be', 'music.youtube.com', 'soundcloud.com'
]

def is_valid_music_url(url: str) -> bool:
    """Check against malicious links."""
    return any(domain in url.lower() for domain in ALLOWED_DOMAINS)

def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if 'spotify.com' in url_lower: return 'Spotify'
    if 'bandcamp.com' in url_lower: return 'Bandcamp'
    if 'tidal.com' in url_lower: return 'Tidal'
    if 'apple.com' in url_lower: return 'Apple Music'
    if 'deezer.com' in url_lower: return 'Deezer'
    if 'music.youtube.com' in url_lower: return 'YT Music'
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower: return 'YouTube'
    if 'soundcloud.com' in url_lower: return 'SoundCloud'
    return 'Other'

def double_check_metadata(artist: str, album: str):
    """Busca el año de lanzamiento usando la API de Spotify."""
    year = "Unknown"
    if artist == "Unknown Band" or album == "Unknown Album":
        return year
    try:
        sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
            client_id=SPOTIPY_CLIENT_ID, 
            client_secret=SPOTIPY_CLIENT_SECRET
        ))
        results = sp.search(q=f"artist:{artist} album:{album}", type='album', limit=1)
        if results['albums']['items']:
            year = results['albums']['items'][0]['release_date'][:4]
    except Exception as e:
        print(f"Spotify API Error: {e}")
    return year

def extract_og_metadata(url: str):
    if not is_valid_music_url(url):
        return {"error": "Invalid URL. Use Spotify, Bandcamp, YouTube, Tidal, etc."}

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, timeout=8, headers=headers)
        if response.status_code != 200:
            return {"error": f"Could not access URL (Status: {response.status_code})"}
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extraer etiquetas Open Graph
        og_title = soup.find('meta', property='og:title')
        og_image = soup.find('meta', property='og:image')
        og_desc = soup.find('meta', property='og:description')
        
        raw_title = og_title['content'] if og_title else ""
        cover_url = og_image['content'] if og_image else ""
        description = og_desc['content'] if og_desc else ""
        
        platform = detect_platform(url)
        artist, album_name = "Unknown Band", "Unknown Album"

        # --- LÓGICA DE EXTRACCIÓN MEJORADA ---

        if platform == 'Bandcamp':
            # Bandcamp: "Album Name, by Artist Name"
            if ', by ' in raw_title:
                parts = raw_title.split(', by ')
                album_name = parts[0].strip()
                artist = parts[1].strip()
        
        elif platform == 'Spotify':
            # Spotify: "Album Name - Album by Artist Name | Spotify"
            clean_title = raw_title.replace(' | Spotify', '')
            if ' - ' in clean_title:
                parts = clean_title.split(' - ')
                album_name = parts[0].strip()
                # Limpiar "Album by..." o "EP by..."
                potential_artist = parts[1].strip()
                if potential_artist.lower().startswith('album by '):
                    artist = potential_artist[9:].strip()
                elif potential_artist.lower().startswith('ep by '):
                    artist = potential_artist[6:].strip()
                else:
                    artist = potential_artist

        else:
            # Lógica general para YouTube, Tidal, etc.
            if ' - ' in raw_title:
                parts = raw_title.split(' - ')
                # Normalmente Artista - Album, pero algunas plataformas lo invierten
                artist = parts[0].strip()
                album_name = parts[1].strip()
            elif ' by ' in raw_title:
                parts = raw_title.split(' by ')
                album_name = parts[0].strip()
                artist = parts[1].strip()

        # Si después de lo anterior seguimos sin artista, probamos con la descripción
        if artist == "Unknown Band" and 'by ' in description:
            match = re.search(r'by (.+?)$|by (.+?) on', description, re.IGNORECASE)
            if match:
                artist = (match.group(1) or match.group(2)).strip()

        # Obtener el año mediante la API de Spotify
        year = double_check_metadata(artist, album_name)

        return {
            "artist": artist,
            "album": album_name,
            "year": year,
            "cover_url": cover_url,
            "platform": platform,
            "url": url
        }
    except Exception as e:
        return {"error": str(e)}