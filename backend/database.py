import logging
import os
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
    desc,
    event,
    func,
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
            connect_args={"check_same_thread": False, "timeout": 15},
        )
        event.listen(self.engine, "connect", _set_wal_mode)
        self.Session = sessionmaker(bind=self.engine)
        self.captures_dir = "/app/data/captures"

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
            return self._record_to_dict(rec)
        finally:
            session.close()

    def _record_to_dict(self, rec):
        return {
            "id": rec.id,
            "timestamp": rec.timestamp.isoformat() if rec.timestamp else None,
            "freq_hz": rec.freq_hz,
            "freq_label": rec.freq_label,
            "band_name": rec.band_name,
            "protocol": rec.protocol,
            "category": rec.category,
            "decoder_used": rec.decoder_used,
            "duration_seconds": rec.duration_seconds,
            "file_size_bytes": rec.file_size_bytes,
            "raw_path": rec.raw_path,
            "json_path": rec.json_path,
            "decode_result": rec.decode_result,
            "decode_count": rec.decode_count,
            "power_db": rec.power_db,
            "estimated_distance_km": rec.estimated_distance_km,
            "weirdness_score": rec.weirdness_score,
            "starred": rec.starred or False,
            "notes": rec.notes,
            "re_decoded": rec.re_decoded or False,
        }

    def get_decode_history(self, limit=50, offset=0, category=None,
                           starred_only=False, freq_min=None, freq_max=None,
                           search_text=None, date_from=None, date_to=None):
        session = self.Session()
        try:
            q = session.query(DecodeHistory)

            if category and category != "all":
                q = q.filter(DecodeHistory.category == category)
            if starred_only:
                q = q.filter(DecodeHistory.starred == True)
            if freq_min is not None:
                q = q.filter(DecodeHistory.freq_hz >= freq_min)
            if freq_max is not None:
                q = q.filter(DecodeHistory.freq_hz <= freq_max)
            if search_text:
                pattern = f"%{search_text}%"
                q = q.filter(
                    (DecodeHistory.protocol.ilike(pattern))
                    | (DecodeHistory.band_name.ilike(pattern))
                    | (DecodeHistory.notes.ilike(pattern))
                    | (DecodeHistory.decode_result.ilike(pattern))
                )
            if date_from:
                q = q.filter(DecodeHistory.timestamp >= date_from)
            if date_to:
                q = q.filter(DecodeHistory.timestamp <= date_to)

            total = q.count()
            records = (
                q.order_by(desc(DecodeHistory.timestamp))
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [self._record_to_dict(r) for r in records], total
        except Exception as e:
            logger.error("Error getting decode history: %s", e)
            return [], 0
        finally:
            session.close()

    def get_decode_count(self):
        session = self.Session()
        try:
            return session.query(func.count(DecodeHistory.id)).scalar() or 0
        finally:
            session.close()

    def get_disk_usage(self):
        total = 0
        if os.path.isdir(self.captures_dir):
            for f in os.listdir(self.captures_dir):
                fp = os.path.join(self.captures_dir, f)
                if os.path.isfile(fp):
                    total += os.path.getsize(fp)
        return total

    def toggle_star(self, record_id):
        session = self.Session()
        try:
            rec = session.query(DecodeHistory).get(record_id)
            if not rec:
                return None
            rec.starred = not (rec.starred or False)
            session.commit()
            return rec.starred
        except Exception as e:
            session.rollback()
            logger.error("Error toggling star: %s", e)
            return None
        finally:
            session.close()

    def add_note(self, record_id, text):
        session = self.Session()
        try:
            rec = session.query(DecodeHistory).get(record_id)
            if not rec:
                return False
            rec.notes = text
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error("Error adding note: %s", e)
            return False
        finally:
            session.close()

    def delete_record(self, record_id, delete_files=True):
        session = self.Session()
        try:
            rec = session.query(DecodeHistory).get(record_id)
            if not rec:
                return False
            if delete_files:
                for path in [rec.raw_path, rec.json_path]:
                    if path and os.path.isfile(path):
                        try:
                            os.remove(path)
                        except OSError:
                            pass
            session.delete(rec)
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error("Error deleting record: %s", e)
            return False
        finally:
            session.close()

    def update_decode_result(self, record_id, json_path, result_json,
                             protocol=None, category=None, decoder_used=None,
                             decode_count=None):
        session = self.Session()
        try:
            rec = session.query(DecodeHistory).get(record_id)
            if not rec:
                return False
            rec.json_path = json_path
            rec.decode_result = result_json
            rec.re_decoded = True
            if protocol:
                rec.protocol = protocol
            if category:
                rec.category = category
            if decoder_used:
                rec.decoder_used = decoder_used
            if decode_count is not None:
                rec.decode_count = decode_count
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error("Error updating decode result: %s", e)
            return False
        finally:
            session.close()

    def auto_cleanup(self, max_disk_gb=10):
        usage = self.get_disk_usage()
        max_bytes = max_disk_gb * 1024 * 1024 * 1024
        if usage <= max_bytes:
            return 0

        session = self.Session()
        deleted = 0
        try:
            # Delete oldest unstarred records first
            records = (
                session.query(DecodeHistory)
                .filter(DecodeHistory.starred != True)
                .order_by(DecodeHistory.timestamp)
                .all()
            )
            for rec in records:
                if usage <= max_bytes * 0.9:
                    break
                freed = 0
                for path in [rec.raw_path, rec.json_path]:
                    if path and os.path.isfile(path):
                        try:
                            freed += os.path.getsize(path)
                            os.remove(path)
                        except OSError:
                            pass
                session.delete(rec)
                usage -= freed
                deleted += 1
            session.commit()
            logger.info("Auto-cleanup: deleted %d records, freed %.1f MB",
                        deleted, (max_bytes - usage) / 1e6)
        except Exception as e:
            session.rollback()
            logger.error("Auto-cleanup error: %s", e)
        finally:
            session.close()
        return deleted
