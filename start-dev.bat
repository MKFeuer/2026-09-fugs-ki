@echo off
echo Starting FUGS-KI dev services...
echo.

:: Start tools MCP server (port 3002)
start "Tools MCP" /d "%~dp0tools" uv run python -c "from main import mcp; mcp.settings.port = 3002; mcp.settings.host = '0.0.0.0'; mcp.run(transport='streamable-http')"

:: Start commandx MCP server (port 3003)
start "CommandX MCP" /d "%~dp0commandx" uv run python -c "from main import mcp; mcp.settings.port = 3003; mcp.settings.host = '0.0.0.0'; mcp.run(transport='streamable-http')"

:: Start agent frontend + backend (port 3001)
start "Agent" /d "%~dp0agent" cmd /c "bun dev"

echo All services started in separate windows:
echo   Tools:    http://localhost:3002/mcp
echo   CommandX: http://localhost:3003/mcp
echo   Agent:    http://localhost:3001
echo.
echo Close the terminal windows to stop the services.
