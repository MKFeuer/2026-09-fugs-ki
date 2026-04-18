from mcp.server.fastmcp import FastMCP
from client import CIMgateClient
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("commandx")

client = CIMgateClient()

def read_messages(mission_id: str) -> list[dict]:
    log.info("TOOL  read_messages")
    return client.get(("mission/" + mission_id + "/message"))

def send_message(mission_id: str, message: str) -> dict:
    log.info("TOOL  send_message")
    return client.post(("mission/" + mission_id + "/message"), json={
        "text": message,
        "sendername": "AI",
        "recivername": "unbekannter Empfänger",
        "messagestatus": 1
    })

def register_message_tools(mcp: FastMCP) -> None:
    mcp.add_tool(
        send_message,
        name="send_message",
        description="""Sends a message to CommandX.
        
        Args:
            mission_id (uuid as str): The ID of the mission to which the message should be sent.
            message (str): The content of the message to be sent.
            Sender is automatically prefilled.
        """)
    mcp.add_tool(
        read_messages,
        name="read_messages",
        description="""Reads messages from CommandX.
        
        Args:
            mission_id (uuid as str): The ID of the mission for which messages should be read.
        """)

