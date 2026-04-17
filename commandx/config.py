from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):

    # Host und Port des CIMgate-Servers
    commandx_host: str

    # Security-Header (Name und Wert aus den CIMgate-Einstellungen)
    commandx_security_header_name: str = "CX5-Security-Token"
    commandx_security_header_value: str

    # Statischer Bearer-Token
    commandx_bearer_token: str

    # SSL-Zertifikat prüfen (false bei selbst-signierten Zertifikaten)
    commandx_verify_ssl: bool = False

    # User-Agent Header
    commandx_user_agent: str = "insomnia/12.5.0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


