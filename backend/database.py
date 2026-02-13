import logging
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    Float,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger("sigint-radar")

Base = declarative_base()


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    freq_hz = Column(Float)
    power_db = Column(Float)
    snr_db = Column(Float)
    protocol = Column(String)
    category = Column(String)
    band_name = Column(String)
    estimated_distance_km = Column(Float)
    weirdness_score = Column(Integer)
    decode_summary = Column(Text)


class DecodeHistory(Base):
    __tablename__ = "decode_history"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    freq_hz = Column(Float)
    freq_label = Column(String)
    band_name = Column(String)
    protocol = Column(String)
    category = Column(String)
    decoder_used = Column(String)
    duration_seconds = Column(Float)
    file_size_bytes = Column(Integer)
    raw_path = Column(String)
    json_path = Column(String)
    decode_result = Column(Text)
    decode_count = Column(Integer)
    power_db = Column(Float)
    estimated_distance_km = Column(Float)
    weirdness_score = Column(Integer)
    starred = Column(Boolean, default=False)
    notes = Column(Text)
    re_decoded = Column(Boolean, default=False)


def _set_wal_mode(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


class Database:
    def __init__(self, db_path="/app/data/signals.db"):
        self.engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
        event.listen(self.engine, "connect", _set_wal_mode)
        self.Session = sessionmaker(bind=self.engine)

    def create_tables(self):
        Base.metadata.create_all(self.engine)
        logger.info("Database tables created")

    def add_signal(self, **kwargs):
        session = self.Session()
        try:
            sig = Signal(**kwargs)
            session.add(sig)
            session.commit()
            signal_id = sig.id
            return signal_id
        except Exception as e:
            session.rollback()
            logger.error("Error adding signal: %s", e)
            return None
        finally:
            session.close()

    def add_decode_record(self, **kwargs):
        session = self.Session()
        try:
            rec = DecodeHistory(**kwargs)
            session.add(rec)
            session.commit()
            record_id = rec.id
            return record_id
        except Exception as e:
            session.rollback()
            logger.error("Error adding decode record: %s", e)
            return None
        finally:
            session.close()

    def get_record(self, record_id):
        session = self.Session()
        try:
            rec = session.query(DecodeHistory).get(record_id)
            if not rec:
                return None
            return {
                "id": rec.id,
                "timestamp": rec.timestamp.isoformat() if rec.timestamp else None,
                "freq_hz": rec.freq_hz,
                "band_name": rec.band_name,
                "protocol": rec.protocol,
                "category": rec.category,
                "decoder_used": rec.decoder_used,
                "duration_seconds": rec.duration_seconds,
                "file_size_bytes": rec.file_size_bytes,
                "raw_path": rec.raw_path,
                "json_path": rec.json_path,
                "decode_count": rec.decode_count,
                "power_db": rec.power_db,
                "weirdness_score": rec.weirdness_score,
            }
        finally:
            session.close()
