let now = import('time').now;

let main = func () {
    for i in range(1, 1001) {

        let div3 = i % 3 == 0;
        let div5 = i % 5 == 0;

        if div3 && div5 {
            print('fizzbuzz');
        } else if div3 {
            print('fizz');
        } else if div5 {
            print('buzz');
        } else {
            print(i);
        }
    }
};

let start = now();
main();
print(now() - start, 'ms');