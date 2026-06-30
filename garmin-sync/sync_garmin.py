import os
import json
from datetime import date, datetime, timezone, timedelta

import firebase_admin
from firebase_admin import credentials, firestore
from garminconnect import Garmin

ZONA = timezone(timedelta(hours=-6))  # America/Merida


def hoy_local():
    return datetime.now(ZONA).date().isoformat()


def conectar_garmin():
    email = os.environ["GARMIN_EMAIL"]
    password = os.environ["GARMIN_PASSWORD"]
    tokenstore = os.environ.get("GARMIN_TOKENSTORE", os.path.expanduser("~/.garminconnect"))

    client = Garmin(email, password)
    try:
        client.login(tokenstore)
    except Exception:
        client.login()
        client.garth.dump(tokenstore)
    return client


def conectar_firestore():
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": os.environ["WP_FIREBASE_PROJECT_ID"],
        "client_email": os.environ["WP_FIREBASE_CLIENT_EMAIL"],
        "private_key": os.environ["WP_FIREBASE_PRIVATE_KEY"].replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    app = firebase_admin.initialize_app(cred, name="weekly-planner-garmin")
    return firestore.client(app)


def extraer_metricas(client, fecha):
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

    return datos


def guardar_en_firestore(db, fecha, datos):
    uid = os.environ["FERNANDA_UID"]
    ref = (
        db.collection("users")
        .document(uid)
        .collection("data")
        .document(f"garmin_{fecha}")
    )
    ref.set({**datos, "fecha": fecha}, merge=True)


def main():
    fecha = hoy_local()
    client = conectar_garmin()
    datos = extraer_metricas(client, fecha)
    db = conectar_firestore()
    guardar_en_firestore(db, fecha, datos)
    print(f"Garmin sync {fecha}: {json.dumps(datos, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
