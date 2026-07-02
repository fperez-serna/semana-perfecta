import os
import json
import time
import schedule
from datetime import datetime, timezone, timedelta

import firebase_admin
from firebase_admin import credentials, firestore
from garminconnect import Garmin

ZONA = timezone(timedelta(hours=-6))  # America/Merida

_db = None
_garmin = None


def hoy_local():
    return datetime.now(ZONA).date().isoformat()


def get_db():
    global _db
    if _db is None:
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": os.environ["WP_FIREBASE_PROJECT_ID"],
            "client_email": os.environ["WP_FIREBASE_CLIENT_EMAIL"],
            "private_key": os.environ["WP_FIREBASE_PRIVATE_KEY"].replace("\\n", "\n"),
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        app = firebase_admin.initialize_app(cred, name="weekly-planner-garmin")
        _db = firestore.client(app)
    return _db


def get_garmin():
    global _garmin
    email = os.environ["GARMIN_EMAIL"]
    password = os.environ["GARMIN_PASSWORD"]
    tokenstore = os.environ.get("GARMIN_TOKENSTORE", os.path.expanduser("~/.garminconnect"))
    if _garmin is None:
        _garmin = Garmin(email, password)
    try:
        _garmin.login(tokenstore)
    except Exception:
        _garmin.login()
        try:
            _garmin.garth.dump(tokenstore)
        except Exception:
            pass
    return _garmin


def sincronizar():
    try:
        fecha = hoy_local()
        client = get_garmin()
        datos = {}

        try:
            hrv = client.get_hrv_data(fecha)
            datos["hrv"] = hrv.get("hrvSummary", {}).get("lastNightAvg") if hrv else None
        except Exception:
            datos["hrv"] = None

        try:
            stats = client.get_stats(fecha)
            datos["bodyBattery"] = stats.get("bodyBatteryMostRecentValue")
            datos["stress"] = stats.get("averageStressLevel")
            datos["restingHR"] = stats.get("restingHeartRate")
            datos["spo2"] = stats.get("averageSpo2")
        except Exception:
            pass

        try:
            sueno = client.get_sleep_data(fecha)
            resumen = sueno.get("dailySleepDTO", {}) if sueno else {}
            segundos = resumen.get("sleepTimeSeconds")
            datos["suenoHoras"] = round(segundos / 3600, 1) if segundos else None
            datos["suenoScore"] = (resumen.get("sleepScores") or {}).get("overall", {}).get("value")
        except Exception:
            pass

        uid = os.environ["FERNANDA_UID"]
        db = get_db()
        db.collection("users").document(uid).collection("data").document(
            f"garmin_{fecha}"
        ).set({**datos, "fecha": fecha}, merge=True)

        print(f"[{datetime.now(ZONA).strftime('%H:%M')}] Garmin sync {fecha}: {json.dumps(datos, ensure_ascii=False)}", flush=True)
    except Exception as e:
        print(f"[{datetime.now(ZONA).strftime('%H:%M')}] Garmin sync error: {e}", flush=True)


if __name__ == "__main__":
    # Horarios en UTC (Mérida = UTC-6 fijo, sin horario de verano desde 2022)
    # 7:30 → 13:30 | 8:30 → 14:30 | 11:25 → 17:25 | 14:00 → 20:00 | 16:00 → 22:00 | 18:00 → 00:00 | 20:00 → 02:00
    # 8:30am agregado para capturar datos de sueño que Garmin procesa después de despertar
    for hora_utc in ["13:30", "14:30", "17:25", "20:00", "22:00", "00:00", "02:00"]:
        schedule.every().day.at(hora_utc).do(sincronizar)

    print("Garmin sync scheduler activo. Horarios: 7:30, 8:30, 11:25, 14:00, 16:00, 18:00, 20:00 (Mérida)", flush=True)
    sincronizar()  # sync inmediato al arrancar

    while True:
        schedule.run_pending()
        time.sleep(30)
