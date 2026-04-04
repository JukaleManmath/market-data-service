from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    alpha_vantage_api_key: str
    finnhub_api_key: str
    redis_host: str
    redis_port: int
    db_price_ttl: int
    kafka_bootstrap_servers: str
    redis_url: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str

    # LLM provider: "claude" (default) or "ollama"
    llm_provider: str = "claude"

    # Claude — required when llm_provider=claude
    anthropic_api_key: str = ""

    # Ollama — required when llm_provider=ollama
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.2"

    class Config:
        env_file = ".env"

settings = Settings()
