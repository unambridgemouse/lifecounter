"""
Lifecounter - Dead Man's Switch Backend
FastAPI + オンメモリDB (辞書) によるひな形

起動方法:
    pip install fastapi uvicorn httpx
    uvicorn main:app --reload --port 8000
"""

import asyncio
import time
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------
GAS_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbwfymOuNu5UNAPnXtNNpPqvE0AR3czyLJN2X-EN02wgI-ZHOztOWwsY8oTJf037PeElMg/exec"
)
CHECKER_INTERVAL_SEC = 10  # 期限チェック間隔（秒）

# ---------------------------------------------------------------------------
# アプリ初期化
# ---------------------------------------------------------------------------
app = FastAPI(title="Lifecounter Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 本番では origin を絞ること
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# オンメモリDB
# {
#   "<user_id>": {
#     "deadline": float,        # UNIX タイムスタンプ（秒）
#     "email": str,
#     "message": str,
#     "emergency_sec": int,
#     "alert_sent": bool,       # 期限切れアラートを送信済みか
#     "last_seen": float,       # 最後のハートビート受信時刻
#   }
# }
# ---------------------------------------------------------------------------
db: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# スキーマ
# ---------------------------------------------------------------------------
class HeartbeatRequest(BaseModel):
    user_id: str
    deadline: float                    # UNIX タイムスタンプ（秒）
    email: Optional[str] = ""          # 後方互換（email[0]と同義）
    emails: Optional[list[str]] = []   # 複数緊急連絡先（最大3件）
    message: Optional[str] = ""
    emergency_sec: int = 3600

class HeartbeatResponse(BaseModel):
    status: str
    deadline: float
    remaining_sec: float

class StatusResponse(BaseModel):
    status: str
    deadline: float
    remaining_sec: float
    is_expired: bool
    last_seen: float

# ---------------------------------------------------------------------------
# エンドポイント
# ---------------------------------------------------------------------------
@app.post("/api/heartbeat", response_model=HeartbeatResponse)
def heartbeat(req: HeartbeatRequest):
    """
    クライアントから生存報告を受け取り、期限をDBに保存する。
    新しい deadline が未来を指している場合、alert_sent フラグをリセットする。
    """
    now = time.time()
    prev = db.get(req.user_id, {})

    # emails リストを正規化（空文字を除去、emailフィールドとマージ）
    all_emails = [e for e in (req.emails or []) if e.strip()]
    if req.email and req.email not in all_emails:
        all_emails.insert(0, req.email)

    db[req.user_id] = {
        "deadline": req.deadline,
        "email": all_emails[0] if all_emails else "",
        "emails": all_emails,
        "message": req.message,
        "emergency_sec": req.emergency_sec,
        # 新しい deadline が未来なら alert_sent をリセット
        "alert_sent": prev.get("alert_sent", False) if req.deadline <= now else False,
        "last_seen": now,
    }

    remaining = max(0.0, req.deadline - now)
    return HeartbeatResponse(status="ok", deadline=req.deadline, remaining_sec=remaining)


@app.get("/api/status/{user_id}", response_model=StatusResponse)
def get_status(user_id: str):
    """
    指定ユーザーの現在の期限状態を返す。
    """
    if user_id not in db:
        raise HTTPException(status_code=404, detail="User not found")

    record = db[user_id]
    now = time.time()
    remaining = max(0.0, record["deadline"] - now)
    return StatusResponse(
        status="ok",
        deadline=record["deadline"],
        remaining_sec=remaining,
        is_expired=(remaining <= 0),
        last_seen=record["last_seen"],
    )


@app.get("/api/users")
def list_users():
    """デバッグ用: 登録済みユーザー一覧と期限を返す。"""
    now = time.time()
    return {
        uid: {
            "deadline": r["deadline"],
            "remaining_sec": round(max(0.0, r["deadline"] - now), 1),
            "is_expired": r["deadline"] <= now,
            "alert_sent": r["alert_sent"],
            "last_seen": r["last_seen"],
        }
        for uid, r in db.items()
    }

# ---------------------------------------------------------------------------
# バックグラウンドタスク: 期限監視
# ---------------------------------------------------------------------------
async def _send_gas_alert(user_id: str, record: dict, survival_days: int):
    """GAS経由でメール通知を送る（fire-and-forget）。複数宛先対応。"""
    body = (
        f"{record['message']}\n\n"
        f"総生存日数: {survival_days} 日\n"
        f"最終ハートビート: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(record['last_seen']))}\n"
        f"期限: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(record['deadline']))}"
    )
    payload = {
        "type": "EMERGENCY ALERT (SERVER)",
        "subject": "【緊急】ライフカウンター生存確認アプリ",
        "message": body,
        "emails": record.get("emails", [record.get("email", "")]),
    }
    try:
        async with httpx.AsyncClient() as client:
            await client.post(GAS_URL, json=payload, timeout=10)
        print(f"[ALERT SENT] user={user_id} → {payload['emails']}")
    except Exception as e:
        print(f"[ALERT FAILED] user={user_id}: {e}")


async def deadline_checker():
    """CHECKER_INTERVAL_SEC ごとに全ユーザーの期限を確認する。"""
    while True:
        await asyncio.sleep(CHECKER_INTERVAL_SEC)
        now = time.time()
        for user_id, record in db.items():
            if record["alert_sent"]:
                continue
            if now >= record["deadline"]:
                print(f"[EXPIRED] user={user_id} — 緊急プロトコル発動")
                record["alert_sent"] = True
                if record.get("email"):
                    survival_days = 0  # 生年月日はクライアント側で管理のため 0 で送信
                    asyncio.create_task(_send_gas_alert(user_id, record, survival_days))


@app.on_event("startup")
async def startup():
    asyncio.create_task(deadline_checker())
    print("✅ Lifecounter backend started. Deadline checker running.")
