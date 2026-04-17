from datetime import datetime

from generic.time import get_current_time


def test_get_current_time_format():
    result = get_current_time()
    # must parse without error
    datetime.strptime(result, "%Y-%m-%d %H:%M:%S")


def test_get_current_time_returns_string():
    assert isinstance(get_current_time(), str)
