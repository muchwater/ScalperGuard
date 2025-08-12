import requests
import streamlit as st

st.set_page_config(page_title="ScalperGuard Dashboard", layout="wide")

st.title("ScalperGuard – Risk Monitor")
base = st.text_input("AI API URL", value="http://localhost:8000")

col1, col2 = st.columns(2)
with col1:
    if st.button("Refresh Scores"):
        pass

try:
    r = requests.get(base + "/score", timeout=5)
    data = r.json()
except Exception as e:
    st.error(str(e))
    st.stop()

wallets = data.get("wallets", [])

st.subheader("Flagged Wallets (risk ≥ 70)")
flagged = [w for w in wallets if w["risk"] >= 70]
if not flagged:
    st.success("No flagged wallets.")
else:
    for w in sorted(flagged, key=lambda x: -x['risk']):
        st.markdown(f"**{w['wallet']}** – risk={w['risk']:.1f} – decision={w['decision']}")
        st.json(w['details'])
        st.caption("집행 예: 아래 Node 스크립트로 KYC revoke 실행")
        st.code("""
# 터미널에서 실행 (지갑 주소를 교체)
# npm run setkyc -- 0xAbC... false
""", language="bash")

st.divider()
st.caption("데모용 – 실제 환경에서는 on-chain 호출을 백엔드 API로 보호하세요.")