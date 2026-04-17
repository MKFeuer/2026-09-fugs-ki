from dwd import _get_current_and_next_12h_for_fixed_station


def main():
    #autobahnen = fetch_all_autobahnen()
    #print(autobahnen)
    weatherdata = _get_current_and_next_12h_for_fixed_station()
    print(weatherdata)


if __name__ == "__main__":
    main()
