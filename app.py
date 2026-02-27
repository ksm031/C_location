import os
import base64
import requests
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-me')

GITHUB_API = 'https://api.github.com'


# ── GitHub API helpers ───────────────────────────────────────────────────────

def gh_headers(token):
    return {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }


def get_config():
    """환경변수 우선, 없으면 세션에서 읽음"""
    return {
        'token': os.environ.get('GITHUB_TOKEN') or session.get('github_token', ''),
        'owner': os.environ.get('GITHUB_OWNER') or session.get('github_owner', ''),
        'repo':  os.environ.get('GITHUB_REPO')  or session.get('github_repo', ''),
        'branch': os.environ.get('GITHUB_BRANCH', 'main'),
    }


def require_config(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        cfg = get_config()
        if not all([cfg['token'], cfg['owner'], cfg['repo']]):
            return jsonify({'error': 'GitHub 설정이 필요합니다. /config 에서 설정하세요.'}), 400
        return f(*args, **kwargs)
    return wrapper


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    cfg = get_config()
    configured = bool(cfg['token'] and cfg['owner'] and cfg['repo'])
    return render_template('index.html', configured=configured, config=cfg)


@app.route('/config', methods=['POST'])
def save_config():
    body = request.get_json()
    session['github_token'] = body.get('token', '').strip()
    session['github_owner'] = body.get('owner', '').strip()
    session['github_repo']  = body.get('repo', '').strip()
    # 연결 테스트
    cfg = get_config()
    r = requests.get(
        f"{GITHUB_API}/repos/{cfg['owner']}/{cfg['repo']}",
        headers=gh_headers(cfg['token']),
        timeout=10,
    )
    if r.status_code == 200:
        return jsonify({'status': 'ok', 'repo': r.json().get('full_name')})
    return jsonify({'error': f"GitHub 연결 실패 ({r.status_code}): {r.json().get('message', '')}"}), 400


@app.route('/save', methods=['POST'])
@require_config
def save():
    body = request.get_json()
    filename = body.get('filename', '').strip()
    text = body.get('text', '')

    if not filename:
        filename = datetime.now().strftime('paste_%Y%m%d_%H%M%S')
    if not filename.endswith('.txt'):
        filename += '.txt'
    filename = os.path.basename(filename)

    cfg = get_config()
    path = f"data/{filename}"
    url  = f"{GITHUB_API}/repos/{cfg['owner']}/{cfg['repo']}/contents/{path}"
    hdrs = gh_headers(cfg['token'])

    # 이미 존재하면 sha 필요
    existing = requests.get(url, headers=hdrs, params={'ref': cfg['branch']}, timeout=10)
    sha = existing.json().get('sha') if existing.status_code == 200 else None

    payload = {
        'message': f'Add {filename}',
        'content': base64.b64encode(text.encode('utf-8')).decode(),
        'branch': cfg['branch'],
    }
    if sha:
        payload['sha'] = sha
        payload['message'] = f'Update {filename}'

    r = requests.put(url, headers=hdrs, json=payload, timeout=15)
    if r.status_code in (200, 201):
        return jsonify({'status': 'ok', 'saved_as': filename})
    return jsonify({'error': r.json().get('message', '저장 실패')}), r.status_code


@app.route('/files')
@require_config
def list_files():
    cfg = get_config()
    url = f"{GITHUB_API}/repos/{cfg['owner']}/{cfg['repo']}/contents/data"
    r = requests.get(url, headers=gh_headers(cfg['token']),
                     params={'ref': cfg['branch']}, timeout=10)
    if r.status_code == 404:
        return jsonify([])
    if r.status_code != 200:
        return jsonify({'error': r.json().get('message')}), r.status_code
    files = sorted(
        f['name'] for f in r.json()
        if f['type'] == 'file' and f['name'].endswith('.txt')
    )
    return jsonify(files)


@app.route('/files/<filename>')
@require_config
def get_file(filename):
    filename = os.path.basename(filename)
    cfg = get_config()
    url = f"{GITHUB_API}/repos/{cfg['owner']}/{cfg['repo']}/contents/data/{filename}"
    r = requests.get(url, headers=gh_headers(cfg['token']),
                     params={'ref': cfg['branch']}, timeout=10)
    if r.status_code != 200:
        return jsonify({'error': 'not found'}), 404
    content = base64.b64decode(r.json()['content']).decode('utf-8')
    return jsonify({'filename': filename, 'content': content})


if __name__ == '__main__':
    app.run(debug=False, port=5000)
