from mcp.server.fastmcp import FastMCP

def get_alarm_keywords() -> list[dict]:
    log.info("TOOL  get_alarm_keywords")
    return client.get("alarm-keyword")


def get_departments() -> list[dict]:
    log.info("TOOL  get_departments")
    return client.get("Department")


def register_other_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        get_alarm_keywords,
        name="get_alarm_keywords",
        description="Gibt alle konfigurierten Alarmstichworte zurück.",
    )
    mcp.add_tool(
        get_departments,
        name="get_departments",
        description="Gibt alle Abteilungen/Organisationen zurück.",
    )

