from flask import Flask, request, jsonify, render_template
import os
from datetime import datetime

app = Flask(__name__)
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/save', methods=['POST'])
def save():
    body = request.get_json()
    filename = body.get('filename', '').strip()
    text = body.get('text', '')

    if not filename:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'paste_{timestamp}'

    if not filename.endswith('.txt'):
        filename += '.txt'

    # 경로 탈출 방지
    filename = os.path.basename(filename)
    filepath = os.path.join(DATA_DIR, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

    return jsonify({'status': 'ok', 'saved_as': filename})


@app.route('/files')
def list_files():
    files = sorted(os.listdir(DATA_DIR))
    return jsonify(files)


@app.route('/files/<filename>')
def get_file(filename):
    filename = os.path.basename(filename)
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'not found'}), 404
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    return jsonify({'filename': filename, 'content': content})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
