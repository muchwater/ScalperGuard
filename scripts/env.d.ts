declare global {
  namespace NodeJS { interface ProcessEnv {
    RPC_URL: string; PRIVATE_KEY: string; CONTRACT_ADDRESS?: string;
    EVENT_START: string; COOLDOWN_SEC: string; BLOCK_BEFORE_START_SEC: string;
  }}
}
export {};