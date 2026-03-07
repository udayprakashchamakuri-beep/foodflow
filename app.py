from flask import Flask, render_template, request, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, current_user, logout_user

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///my_web_app.db'

db = SQLAlchemy(app)
login_manager = LoginManager(app)

class User(UserMixin, db.Model):
	id = db.Column(db.Integer, primary_key=True)
	username = db.Column(db.String(64), unique=True, index=True)
	password = db.Column(db.String(128))

@login_manager.user_loader
def load_user(id):
	return User.query.get(int(id))

@app.route('/login', methods=['POST'])
@login_required
def login():
	return 'You are logged in'

@app.route('/register', methods=['POST'])
def register():
	new_user = User(username=request.form['username'], password=request.form['password'])
	db.session.add(new_user)
	db.session.commit()
	login_user(new_user)
	return redirect(url_for('dashboard'))

@app.route('/dashboard', methods=['GET'])
@login_required
def dashboard():
	data = User.query.all()
	return render_template('dashboard.html', data=data)

@app.route('/logout', methods=['GET'])
@login_required
def logout():
	logout_user()
	return redirect(url_for('index'))

if __name__ == '__main__'
	app.run(debug=True)
