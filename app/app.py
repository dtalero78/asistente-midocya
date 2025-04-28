from flask import Flask, jsonify, request, render_template
import requests
from flask_cors import CORS
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker


load_dotenv()


Base = declarative_base()
engine = create_engine('sqlite:///historias.db')
SessionLocal = sessionmaker(bind=engine)


class HistoriaClinica(Base):
    __tablename__ = "historia_clinica"

    id               = Column(Integer, primary_key=True, index=True)
    nombre           = Column(String(255))
    edad             = Column(String(50))
    sexo             = Column(String(50))
    nacimiento       = Column(String(50))
    documento        = Column(String(50))
    estado_civil     = Column(String(50))
    ocupacion        = Column(String(255))
    direccion        = Column(String(255))
    ciudad           = Column(String(255))
    eps              = Column(String(255))
    enfermedades     = Column(Text)
    hospitalizaciones= Column(Text)
    medicamentos     = Column(Text)
    alergias         = Column(Text)
    celular          = Column(String(20))   # <-- Nuevo campo

    def to_dict(self):
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}


# Crea la tabla si no existe
Base.metadata.create_all(bind=engine)
print("🗃️ Base de datos lista: historias.db")


app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)
print("✅ Flask iniciado correctamente")


@app.route('/')
def index():
    return render_template('call.html')


@app.route('/session', methods=['GET'])
def get_session():
    try:
        url = "https://api.openai.com/v1/realtime/sessions"
        
        payload = {
            "model": "gpt-4o-realtime-preview-2024-12-17",
            "modalities": ["audio", "text"],
            "voice": "ash",
            "instructions": ""
        }
        
        headers = {
            'Authorization': 'Bearer ' + os.getenv('OPENAI_API_KEY'),
            'Content-Type': 'application/json'
        }

        response = requests.post(url, json=payload, headers=headers)
        return response.json()

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/send-email', methods=['POST'])
def send_email():
    try:
        data = request.json
        msg = MIMEText(data['message'])
        msg['Subject'] = 'Call Summary'
        msg['From'] = os.getenv('SMTP_USERNAME')
        msg['To'] = os.getenv('RECEIVING_EMAIL')

        with smtplib.SMTP_SSL(
            host=os.getenv('SMTP_HOST'),
            port=int(os.getenv('SMTP_PORT')),
            timeout=10
        ) as server:
            server.login(
                os.getenv('SMTP_USERNAME'),
                os.getenv('SMTP_PASSWORD')
            )
            server.send_message(msg)
            
        return jsonify({
            'success': True, 
            'message': 'Email sent successfully'
        })

    except smtplib.SMTPConnectError:
        return jsonify({
            'error': 'Failed to connect to email server'
        }), 503
    except smtplib.SMTPAuthenticationError:
        return jsonify({
            'error': 'Email authentication failed'
        }), 401
    except Exception as e:
        return jsonify({
            'error': f"Email error: {str(e)}"
        }), 500


@app.route('/guardar-historia', methods=['POST'])
def guardar_historia():
    db = SessionLocal()
    try:
        data = request.json
        nueva_historia = HistoriaClinica(**data)
        db.add(nueva_historia)
        db.commit()
        db.refresh(nueva_historia)
        return jsonify({"success": True, "id": nueva_historia.id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@app.route('/historias', methods=['GET'])
def get_historias():
    db = SessionLocal()
    try:
        historias = db.query(HistoriaClinica).all()
        return jsonify([h.to_dict() for h in historias])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/ver-historias')
def ver_historias():
    return render_template('historias.html')


@app.route('/historia/<int:historia_id>', methods=['GET'])
def obtener_historia(historia_id):
    db = SessionLocal()
    try:
        historia = db.query(HistoriaClinica).filter_by(id=historia_id).first()
        if historia:
            return jsonify({
                "success": True,
                "historia": historia.to_dict()
            })
        else:
            return jsonify({
                "success": False,
                "error": "Historia no encontrada"
            }), 404
    except Exception as e:
        return jsonify({ "success": False, "error": str(e) }), 500
    finally:
        db.close()


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5001))  # Lee el puerto de la variable de entorno
    app.run(debug=True, host="0.0.0.0", port=port)
