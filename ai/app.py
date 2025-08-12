from __future__ import annotations
from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from features import compute_features

app = FastAPI(title="ScalperGuard AI")

class ScoreResponse(BaseModel):
    wallet: str
    risk: float
    decision: str
    details: dict

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/score")
def score():
    # 특징 계산 (최근 이벤트 로그 기반)
    feat = compute_features()
    if feat.empty:
        return {"wallets": [], "note": "no transfers yet"}

    X = feat[["tx_count_10m","avg_gap_sec","degree_centrality","flip_ratio"]].copy()

    # 간단 스케일링
    X['avg_gap_sec'] = np.log1p(X['avg_gap_sec'])

    # IsolationForest로 이상 점수
    model = IsolationForest(n_estimators=200, contamination=0.1, random_state=42)
    model.fit(X)
    iso = -model.score_samples(X)  # 높을수록 이상

    # 규칙 점수(0-100)
    rule = np.zeros(len(X))
    rule += (feat['tx_count_10m'] >= 3).astype(int) * 30
    rule += (feat['degree_centrality'] > 0.2).astype(int) * 20
    rule += (feat['flip_ratio'] > 0.1).astype(int) * 20
    rule += (feat['avg_gap_sec'] < 60).astype(int) * 30  # 빠른 전송 반복

    # 정규화 후 앙상블
    z = (iso - iso.mean())/ (iso.std() + 1e-6)
    anomaly_score = np.clip(z*15 + 50, 0, 100)
    rule_score = np.clip(rule, 0, 100)
    risk = 0.6*anomaly_score + 0.4*rule_score

    feat['risk'] = risk

    # 의사결정
    def decide(r):
        if r >= 85: return "HARD_BLOCK"
        if r >= 70: return "SOFT_BLOCK"
        return "ALLOW"

    results = []
    for i, row in feat.iterrows():
        results.append(ScoreResponse(
            wallet=row['wallet'],
            risk=float(row['risk']),
            decision=decide(row['risk']),
            details={
                "tx_count_10m": int(row['tx_count_10m']),
                "avg_gap_sec": float(row['avg_gap_sec']),
                "degree_centrality": float(row['degree_centrality']),
                "flip_ratio": float(row['flip_ratio'])
            }
        ).model_dump())

    return {"wallets": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)