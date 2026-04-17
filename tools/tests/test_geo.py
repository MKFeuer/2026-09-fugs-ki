import pytest

from geotools.geo import distance_wgs84_geodesic
from geotools.geo import point_in_polygon

def test_distance_berlin_short():
    # Two points ~57m apart in Berlin
    result = distance_wgs84_geodesic(
        (52.52042741543588, 13.405782162596813),
        (52.52074696727995, 13.406442521399553),
    )
    assert result == pytest.approx(57.22, abs=0.01)


def test_distance_same_point_is_zero():
    result = distance_wgs84_geodesic((48.137154, 11.576124), (48.137154, 11.576124))
    assert result == 0.0


def test_distance_is_symmetric():
    a = distance_wgs84_geodesic((52.0, 13.0), (53.0, 14.0))
    b = distance_wgs84_geodesic((53.0, 14.0), (52.0, 13.0))
    assert a == pytest.approx(b, rel=1e-9)

def test_point_in_polygon():
    # Define a simple square polygon
    polygon = [(52.0, 13.0), (52.0, 14.0), (53.0, 14.0), (53.0, 13.0)]
    # Point inside the polygon
    point = (52.5, 13.5)
    assert point_in_polygon(point, polygon) == True

def test_point_outside_polygon():
    # Define a simple square polygon
    polygon = [(52.0, 13.0), (52.0, 14.0), (53.0, 14.0), (53.0, 13.0)]

    # Point outside the polygon (lat and lon)
    point = (51.0, 12.0)
    assert point_in_polygon(point, polygon) == False

    # Point outside the polygon (only lat)
    point = (52.5, 15.0)
    assert point_in_polygon(point, polygon) == False

    # Point outside the polygon (only lon)
    point = (51.0, 12.0)
    assert point_in_polygon(point, polygon) == False