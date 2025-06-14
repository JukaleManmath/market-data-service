from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    alpha_vantage_api_key: str

    class Config:
        env_file = ".env"

settings = Settings()