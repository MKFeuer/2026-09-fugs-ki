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

def read_messages(mission_id: str, limit: int | None = None) -> list[dict]:
    log.info("TOOL  read_messages")
    messages = client.get(("mission/" + mission_id + "/message"))
    if limit is not None:
        messages = messages[:limit]
    allowed_keys = {
        "date",
        "text",
        "senderName",
        "receiverName",
        "priority",
        "messageNumber",
        "messageStatus",
        "id",
    }
    return [
        {key: message.get(key) for key in allowed_keys if key in message}
        for message in messages
    ]

def send_message(mission_id: str, message: str, receiver_name: str = "unbekannter Empfänger") -> dict:
    log.info("TOOL  send_message")
    return client.post(("mission/" + mission_id + "/message"), json={
        "text": message,
        "sendername": "AI",
        "recivername": receiver_name,
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
            receiver_name (str optional): The name of the message receiver. Default is "unbekannter Empfänger".
            Sender is automatically prefilled.
        """)
    mcp.add_tool(
        read_messages,
        name="read_messages",
        description="""Reads messages from CommandX.
        
        Args:
            mission_id (uuid as str): The ID of the mission for which messages should be read.
            limit (int optional): Maximum number of messages to return. If not provided, all messages will be returned.
        """)

