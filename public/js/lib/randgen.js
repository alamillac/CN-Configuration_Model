var RandGen = (function() {
    // Generate Poisson distributed random numbers
    var _public = {
        rpoisson: function(lambda) {
            if (lambda === undefined) {
                lambda = 1;
            }
            var l = Math.exp(-lambda),
                k = 0,
                p = 1.0;
            do {
                k++;
                p *= Math.random();
            } while (p > l);

            return k - 1;
        }
    };
    return _public;
})();
