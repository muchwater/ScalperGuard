from __future__ import annotations
import json, os
import pandas as pd
import networkx as nx
from typing import Tuple

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE_DIR, os.pardir))
OUT = os.path.join(ROOT, 'indexer', 'out')

TRANSFERS = os.path.join(OUT, 'transfers.jsonl')

# 간단한 특징 추출: wallet 단위
# - 최근 10분 전송 횟수(tx_count_10m)
# - 평균 전송 간격(avg_gap_sec)
# - degree_centrality (그래프 중심성)
# - flip 빈도(왕복 전송 비율)

def load_transfers() -> pd.DataFrame:
    if not os.path.exists(TRANSFERS):
        return pd.DataFrame(columns=['ts','block','tx','from','to','tokenId'])
    records = [json.loads(line) for line in open(TRANSFERS,'r', encoding='utf-8') if line.strip()]
    df = pd.DataFrame(records)
    if not df.empty:
        df['ts'] = pd.to_datetime(df['ts'], unit='s')
    return df


def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    G = nx.DiGraph()
    for _, r in df.iterrows():
        G.add_edge(r['from'], r['to'])
    return G


def compute_features(now_ts: pd.Timestamp|None=None) -> pd.DataFrame:
    df = load_transfers()
    if df.empty:
        return pd.DataFrame(columns=['wallet','tx_count_10m','avg_gap_sec','degree_centrality','flip_ratio'])

    df = df.sort_values('ts')
    if now_ts is None:
        now_ts = df['ts'].max()

    # 최근 10분 윈도우
    win_df = df[df['ts'] >= (now_ts - pd.Timedelta(minutes=10))]

    # 전송 간격 계산을 위해 wallet별 time diffs
    gaps = []
    for w in pd.unique(pd.concat([df['from'], df['to']])):
        sub = df[(df['from']==w) | (df['to']==w)].sort_values('ts')['ts']
        if len(sub) >= 2:
            s = sub.diff().dt.total_seconds().dropna()
            gaps.append((w, s.mean()))
        else:
            gaps.append((w, float('nan')))
    gap_df = pd.DataFrame(gaps, columns=['wallet','avg_gap_sec'])

    # 최근 10분 전송 횟수
    cnt_from = win_df.groupby('from').size().reset_index(name='from_cnt')
    cnt_to = win_df.groupby('to').size().reset_index(name='to_cnt')
    cnt = pd.merge(cnt_from, cnt_to, how='outer', left_on='from', right_on='to')
    cnt['wallet'] = cnt['from'].fillna(cnt['to'])
    cnt['tx_count_10m'] = cnt['from_cnt'].fillna(0) + cnt['to_cnt'].fillna(0)
    cnt = cnt[['wallet','tx_count_10m']]

    # 그래프 중심성
    G = build_graph(df)
    if len(G) > 0:
        deg = nx.degree_centrality(G)
    else:
        deg = {}
    deg_df = pd.DataFrame([{'wallet': k, 'degree_centrality': v} for k,v in deg.items()])

    # flip ratio: 동일 토큰의 왕복(AB-BA) 패턴 비율 근사치
    flip = []
    if not df.empty:
        # 토큰별로 from->to 문자열을 이어서 역방향 존재하면 flip 증가
        for w in pd.unique(pd.concat([df['from'], df['to']])):
            sub = df[(df['from']==w) | (df['to']==w)]
            pairs = set(tuple(x) for x in sub[['from','to']].values.tolist())
            rev = sum(1 for (a,b) in pairs if (b,a) in pairs and a!=b)
            denom = max(1, len(pairs))
            flip.append((w, rev/denom))
    flip_df = pd.DataFrame(flip, columns=['wallet','flip_ratio'])

    # 조인
    feat = pd.merge(cnt, gap_df, on='wallet', how='outer')
    feat = pd.merge(feat, deg_df, on='wallet', how='left')
    feat = pd.merge(feat, flip_df, on='wallet', how='left')

    # 결측치 처리
    feat['tx_count_10m'] = feat['tx_count_10m'].fillna(0)
    feat['avg_gap_sec'] = feat['avg_gap_sec'].fillna(9999)
    feat['degree_centrality'] = feat['degree_centrality'].fillna(0.0)
    feat['flip_ratio'] = feat['flip_ratio'].fillna(0.0)

    return feat[['wallet','tx_count_10m','avg_gap_sec','degree_centrality','flip_ratio']]