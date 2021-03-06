let airportsTXT = [
    ['JFK', 'John F Kennedy International', 5326, 5486],
    ['ORY', 'Paris-Orly', 629, 379],
    ['MAD', 'Adolfo Suarez Madrid-Barajas', 1428, 1151],
    ['AMS', 'Amsterdam Schiphol', 526, 489],
    ['CAI', 'Cairo International', 3779, 3584]
];

list_of_airports = [];

// inputted data:
let uk_airport = '';
let overseas_airport = '';
let airplane_type = -1;
let first_seats = 0;
let first_price = 0;
let standard_price = 0;

// setting the types of airplanes as ints for use in the data dict:
let medium_narrow = 0;
let large_narrow = 1;
let medium_wide = 2;

// variables for each type of airplane
let running_cost = 0;
let max_range = 1;
let max_capacity = 2;
let min_first_class = 3;

// fixed data for each type of airplane
let airplane_types_data = {
    [medium_narrow]: {
        [running_cost]: 8,
        [max_range]: 2650,
        [max_capacity]: 180,
        [min_first_class]: 8
    },
    [large_narrow]: {
        [running_cost]: 7,
        [max_range]: 5600,
        [max_capacity]: 220,
        [min_first_class]: 10
    },
    [medium_wide]: {
        [running_cost]: 5,
        [max_range]: 4050,
        [max_capacity]: 406,
        [min_first_class]: 14
    }
};

let Airplane = class {
    init (airplane_type) {
        type_data = airplane_types_data[airplane_type];

        this.running_cost = type_data[running_cost];
        this.max_range = type_data[max_range];
        this.max_capacity = type_data[max_capacity];
        this.min_first_class = type_data[min_first_class];
    }
};

let Airport = class {
    init (data) {
        this.code = data[0];
        this.name = data[1];
        this.dist_LJL = data[2];
        this.dist_BI = data[3];
    }
};

let initialise = func () {
    for data in airportsTXT {
        list_of_airports.add(Airport(data));
    }
};

// menu.py
let clear_data = func () {
    uk_airport = '';
    overseas_airport = nil;
    airplane_type = 0;
    first_seats = 0;
    first_price = 0;
    standard_price = 0;
};

let VALID_UK_CODES = ['LPL', 'BOH'];

let enter_airport_details = func () {
    // for entering the UK airport code

    input('UK airport code (either LPL or BOH): ', func (uk_airport) {
        if VALID_UK_CODES.contains(uk_airport) {
            uk_airport = uk_airport
        } else {
            print('Sorry, that is not a valid code, or the airport you are looking for does not exist.');
            enter_airport_details();
            return;
        }

        // for entering the overseas airport code

        var get_overseas_airport = func () {
            input('Overseas airport code: ', func (overseas_airport) {
                // loops through all the possible airport codes, and checks to see if the code matches
                let var valid = false;
                for i in list_of_airports {
                    if i.code == overseas_airport {
                        valid = true;
                        overseas_airport = i;
                        print('The name of the overseas airport is ', i.name, '.');
                    }
                }

                if !valid {
                    print('Sorry, that is not a valid code, or the airport you are looking for does not exist.');
                    get_overseas_airport();
                }

                main_menu();

            });
        };
        get_overseas_airport();
    });
};

let VALID_AIRPLANE_TYPES = ['medium narrow', 'large narrow', 'medium wide'];

let enter_flight_details = func () {
    input('Type of aircraft to be used: ', func (response) {
		print(response);
        if !VALID_AIRPLANE_TYPES.contains(response) {
            print('not valid');
            enter_flight_details();
            return;
        }

        print('    -	Aircraft details:	-	');
        if response == 'medium narrow' {
           airplane_type = medium_narrow;
	    } else if response == 'large narrow' {
	    	airplane_type = large_narrow;
	    } else if response == 'medium wide' {
            airplane_type = medium_wide;
	    }

        let var aircraft_data = airplane_types_data[airplane_type];

        print('The running cost per km is ' + str(aircraft_data[running_cost]));
        print('The maximum range in km is ' + str(aircraft_data[max_range]));
        print('The maximum capacity is ' + str(aircraft_data[max_capacity]));
        print('The minimum first class seats is ' + str(aircraft_data[min_first_class]));


        let var get_first_class_seats = func () {
            input('How many first class seats?', func (first_class_seats) {
                if (first_class_seats < 0) {
                    main_menu();
                    return;
                }
                if first_class_seats < aircraft_data[min_first_class] {
                	print('That is smaller than the minimum number of first class seats for that aircraft.');
                } else if first_class_seats > aircraft_data[max_capacity] / 2 {
                    print('That is larger than the maximum number of first class seats for that aircraft.');
                } else {
                    first_seats = first_class_seats;
                    valid_response = true;
                    max_standard_seats = aircraft_data[max_capacity];
                    number_of_standard_seats = max_standard_seats - first_class_seats / 2;
                    print('the number of standard class seats is ' + str(maths.round(number_of_standard_seats)));
                }

                main_menu();
            });
        };
        get_first_class_seats();
    });
};

let calculate_cost = func () {
    if uk_airport == "" || overseas_airport == nil {
        print('Sorry, please enter flight details first');
        main_menu();
        return;
    } else if airplane_type == -1 {
        print('Sorry, please enter airplane type first');
        main_menu();
        return;
    } else if first_seats == 0 {
        print('Sorry, please enter the number of first class seats first');
        main_menu();
        return;
    }
    airplane_max = airplane_types_data[airplane_type][max_range];

    let var airport_dist;
    if uk_airport == 'LJL'{
		airport_dist = overseas_airport.dist_LJL;
   	} else {
   		airport_dist = overseas_airport.dist_BI;
   	}

    if airplane_max < airport_dist {
        print('Sorry, but the range of the selected airport is too short for the flight plan');
        main_menu();
        return;
    }

    let var get_first_class_seats = func () {
        input('Please enter the price of a first class seat', func (price) {
            price = parseNum(price);
            if (!price && price != undefined) || price < 0 {
                print('error, please try again');
                get_first_class_seats();
                return;
            }

            let var get_standard_seats = func () {
                input('Please enter the price of a standard class seat', func (price) {
                    price = parseNum(price);
                    if (!price && price != undefined) || price < 0 {
                        print('error, please try again');
                        get_standard_seats();
                        return;
                    }

                    let standard_seats = airplane_types_data[airplane_type][max_capacity] - first_seats * 2;
                    let cost_per_seat = parseNum(airplane_types_data[airplane_type][running_cost]) * airport_dist / 100;
                    let cost = cost_per_seat * (first_seats + standard_seats);
                    let income = first_seats * first_price + standard_seats * standard_price;
                    let profit = income - cost;

                    print('The flight costs ' + cost_per_seat + ' per seat.');
                    print('The flight costs ' + cost + ' in total.');
                    print('The flight has a total income of ' + income + '.');
                    print('The flight\'s profit is ' + profit + '.');

                    main_menu();
                });
            };
            get_standard_seats();
        });
    };
    get_first_class_seats();
};

// end menu.py

let main_menu = func () {
    print('What would you like to do?');
    input("You can 'calculate flight profit', 'enter airport details', 'enter flight details', 'clear data' or 'quit'\n", func (option) {
        if (option == 'quit') {}

        else if option == 'calculate flight profit' {
        	calculate_cost();
        } else if option == 'enter airport details' {
        	enter_airport_details();
        } else if option == 'enter flight details' {
        	enter_flight_details();
        } else if option == 'clear data' {
            clear_data();
            main_menu();
        } else {
            print('Not an option, sorry');
            main_menu();
        }
    });
};

initialise();
main_menu();