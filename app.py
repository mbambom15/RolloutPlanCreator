from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/create_rollout')
def create_rollout():
    return render_template('create.html')

if __name__ == '__main__':
    app.run(debug=True)