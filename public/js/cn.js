var CN = (function() {
    var _distribution = {
        POISSON: 0,
        POWER_LAW: 1
    };

    var _power_law_exponent_estimation = {
        maximumLikelihood: function(k) {
            var k_min = k.reduce(function (p, v) { return ( p < v ? p : v ); });
            var denominator = k_min - 0.5;
            var helper = 0;
            for(var i=0; i<k.length; i++) {
                helper += Math.log(k[i]/denominator);
            }
            return 1 + k.length/helper;
        },
    };

    var _core = {
        create_network: function(k_array, callback) {
            var progressFn = function(length, length_total) {
                //function that show the remaining edges to process
                console.log("create_network: helper size: "+length);
                $("#numEdges").text(length);
            };

            console.log("create_network: init");
            var network = {};
            var edges = [];

            //create helper array
            var helper = [];
            for(var i=0; i<k_array.length; i++) {
                network[i] = [];
                for(var j=0; j<k_array[i]; j++) {
                    helper.push(i); //insert node_id in helper array
                }
            }

            //helper should have an even number of items
            if(helper.length % 2) {
                return null;
            }

            var helper_length_total = helper.length;
            console.log("create_network: helper size: "+helper_length_total);
            var current_node_id, current_node_in_helper;
            var target_node_id, target_node_in_helper;

            (function() {
                var i = 0;
                while(helper.length && i < 1000) {
                    //select current node
                    current_node_in_helper = 0;
                    current_node_id = helper[current_node_in_helper];
                    //remove it from helper
                    helper.splice(current_node_in_helper, 1);

                    //choose a target node
                    target_node = _core.choose_target(helper, current_node_id);

                    //if the target couldn't be selected from the helper array. try to select from a previous selected edges
                    if(!target_node) {
                        target_node = _core.choose_target_from_net(network, current_node_id);
                    }

                    //if the target couldn't be selected, we have a big problem :(
                    if(target_node) {
                        target_node_in_helper = target_node['helper_id'];
                        target_node_id = target_node['node_id'];

                        //asign network edges
                        edges.push([current_node_id, target_node_id]);
                        network[current_node_id].push(target_node_id);
                        network[target_node_id].push(current_node_id);

                        //remove target node from helper
                        helper.splice(target_node_in_helper, 1);
                    }
                    else {
                        console.log("create_network: BIG PROBLEM. An edge couldn't be assigned");
                    }

                    //increment i
                    i++;
                }

                if(helper.length) {
                    // Inform the application of the progress
                    progressFn(helper.length, helper_length_total);
                    // Process next chunk
                    setTimeout(arguments.callee, 0);
                }
                else {
                    // Inform the application of the progress
                    progressFn(helper.length, helper_length_total);
                    //End of function
                    console.log("create_network: end");
                    callback({ 'network': network, 'edges': edges });
                }
            })();
        },

        choose_target_from_net: function(network, current_node_id) {

            return null;
        },

        choose_target: function(helper, current_node_id) {
            var select_random = function(max_value) {
                //select a random number between 0 and max_value
                return (Math.random() * max_value | 0);
            };

            if(!helper.length) {
                //if the array is void return null
                return null;
            }

            //try to choose a target node randomly
            var target_node_in_helper = select_random(helper.length);
            var target_node_id = helper[target_node_in_helper];

            //try to choose a different node if its the same as current_node_id
            //if a new node is not reached before max_attempts a null value is returned
            var max_attempts = 30, i = 0;
            while(target_node_id == current_node_id && i<max_attempts) {
                //choose again
                target_node_in_helper = select_random(helper.length);
                target_node_id = helper[target_node_in_helper];
                i++;
            }

            var target_node = null;
            if (target_node_id != current_node_id) {
                target_node = {
                    helper_id: target_node_in_helper,
                    node_id: target_node_id
                };
            }

            return target_node;
        },

        create_text_network: function(net) {
            if(!net) {
                return null;
            }

            var network = net.network;
            var edges = net.edges;

            var network_size = Object.keys(network).length;
            var text = '*Vertices '+ network_size +'\n';
            for(var i=0; i<network_size; i++) {
                var network_id = i+1;
                text += network_id + ' "' + network_id + '"\n';
            }
            text += '\n';

            text += '*Edges\n';
            for(var i=0; i<edges.length; i++) {
                var edge_0 = edges[i][0] + 1;
                var edge_1 = edges[i][1] + 1;
                text += edge_0 + ' ' + edge_1 + ' 1\n';
            }

            return text;
        }

    };

    var _url_handler = {
        textFile: null,

        //Create a url to download a text file
        makeTextFile: function(text) {
            var data = new Blob([text], {type: 'text/plain'});

            if(this.textFile !== null) {
                window.URL.revokeObjectURL(this.textFile);
            }

            this.textFile = window.URL.createObjectURL(data);

            return this.textFile;
        },

        showFileLink: function(text) {
            var link = document.getElementById('downloadlink');
            link.href = this.makeTextFile(text);
            link.style.display = 'block';
        }
    };

    var _chart = {
        ready: false,
        pending_callbacks: [],

        //init google chart library and draw pending graphs
        init: function() {
            google.load('visualization', '1', {'packages':['corechart']});
            google.setOnLoadCallback(function() {
                _chart.ready = true;
                if(_chart.pending_callbacks.length) {
                    var callback;
                    while(_chart.pending_callbacks.length) {
                        callback = _chart.pending_callbacks.pop();
                        callback();
                    }
                }
            });
        },

        draw_when_ready: function(callback) {
            if(_chart.ready) {
                callback();
            }
            else {
                _chart.pending_callbacks.push(callback);
            }
        },

        draw_ccdf_histogram: function(k) {
            this.draw_when_ready(function() {

                var hist_pdf = {}, degree;
                for(var i=0; i<k.length; i++) {
                    degree = k[i];

                    if(hist_pdf[degree]) {
                        hist_pdf[degree]++;
                    }
                    else {
                        hist_pdf[degree] = 1;
                    }
                }

                var degrees = [];
                for(degree in hist_pdf) {
                    degrees.push(parseInt(degree));
                }

                degrees.sort(function(a, b){return a-b});

                var hist_ccdf = {}, cum_sum = 0, degree;
                for(var i=degrees.length-1; i>=0; i--) {
                    degree = degrees[i];
                    cum_sum += hist_pdf[degree];
                    hist_ccdf[degree] = cum_sum;
                }

                var max_value = 1, max_degree = 0, data_rows = [["Degree", "Histogram"]], degree;
                for(degree_str in hist_ccdf) {
                    degree = parseInt(degree_str);

                    if(degree > max_degree) {
                        max_degree = degree;
                    }

                    data_rows.push([degree, hist_ccdf[degree]/cum_sum])
                }

                var options = {
                    title: 'CCDF Histogram',
                    hAxis: {title: 'Degree', minValue: 0, maxValue: max_degree, logScale: true},
                    vAxis: {title: 'Histogram', minValue: 0, maxValue: max_value, logScale: true},
                    legend: 'none'
                };

                var data = google.visualization.arrayToDataTable(data_rows);

                // Instantiate and draw our chart, passing in some options.
                var chart = new google.visualization.ScatterChart(document.getElementById('chartCCDF'));
                chart.draw(data, options);
                $("#downloadChartCCDF").attr('href', chart.getImageURI());
            });
        },

        draw_pdf_histogram: function(k) {
            this.draw_when_ready(function() {

                var hist_k = {}, degree;
                for(var i=0; i<k.length; i++) {
                    degree = k[i];

                    if(hist_k[degree]) {
                        hist_k[degree]++;
                    }
                    else {
                        hist_k[degree] = 1;
                    }
                }

                var max_value = 0, max_degree = 0, data_rows = [["Degree", "Histogram"]], degree;
                for(degree_str in hist_k) {
                    degree = parseInt(degree_str);
                    if(degree > max_degree) {
                        max_degree = degree;
                    }
                    if(hist_k[degree] > max_value) {
                        max_value = hist_k[degree];
                    }
                    data_rows.push([degree, hist_k[degree]])
                }

                var options = {
                    title: 'PDF Histogram',
                    hAxis: {title: 'Degree', minValue: 0, maxValue: max_degree},
                    vAxis: {title: 'Histogram', minValue: 0, maxValue: max_value},
                    legend: 'none'
                };

                var data = google.visualization.arrayToDataTable(data_rows);

                // Instantiate and draw our chart, passing in some options.
                var chart = new google.visualization.ScatterChart(document.getElementById('chartPDF'));
                chart.draw(data, options);
                $("#downloadChartPDF").attr('href', chart.getImageURI());
            });
        }
    };

    var _gui = {
        selectors: {
            complex_network_id: '',
            btn_form: ''
        },

        /*
         * structure that contain the network element
         */
        graph_network: {
            nodes: [],
            edges: []
        },

        /*
         * structure used by sigma library.
         */
        sigma_structure: null,

        /*
         * init all the jquery events from the page.
         */
        init_events: function() {
            $(_gui.selectors.btn_form).on('click', _gui.newGraphHandler);
            $(_gui.selectors.sel_distribution).on('click', _gui.updateDegreeHelperLabel);
        },

        /*
         * Update the name of the label when other distribution is selected
         */
        updateDegreeHelperLabel: function(event) {
            event.preventDefault();
            if (this.value == _distribution.POISSON) {
                var newLabelText = "Lambda";
                var helperValue = "5";
                var attrs = {
                    placeholder: "eg. 5",
                    min: "1",
                    max: "100",
                    step: "1"
                };
            }
            else if (this.value == _distribution.POWER_LAW) {
                var newLabelText = "Exponent";
                var helperValue = "2.5";
                var attrs = {
                    placeholder: "eg. 2,5",
                    min: "2.0",
                    max: "3.0",
                    step: "0.1"
                };
            }
            $(_gui.selectors.sel_degree_helper_label).text(newLabelText);
            $(_gui.selectors.sel_degree_helper).val(helperValue);
            for(attr in attrs) {
                $(_gui.selectors.sel_degree_helper).attr(attr, attrs[attr]);
            }
        },

        /*
         * This function is executed when a click event is trigger by a user.
         * The number of nodes is obtained from form and a new network graph is generated.
         */
        newGraphHandler: function(event) {
            event.preventDefault();
            var N = $(this.form).find('[name='+_gui.selectors.name_num_nodes+']').val();
            var distribution_function = $(this.form).find('[name='+_gui.selectors.name_distribution+']').val();
            var distribution_argument = $(this.form).find('[name='+_gui.selectors.name_distribution_arg+']').val();
            var waiting_modal = $("#infoModal");
            waiting_modal.addClass("active");
            setTimeout(function() {
                _gui.create_graph(N, distribution_function, distribution_argument,  function() {
                    _gui.show();
                    waiting_modal.removeClass("active");
                });
            }, 10);
        },

        /*
         * Create a graph with a number of nodes given. By default the number of nodes are
         * 500
         */
        create_graph: function(N, distribution_function, distribution_argument, callback) {
            //default values
            if(!N) {
                var N = 500;
            }

            if(!distribution_function) {
                var distribution_function = _distribution.POISSON;
                var distribution_argument = 5;
            }

            var i,
                s,
                E = 500;

            // Generate a graph
            _gui.graph_network = {
                nodes: [],
                edges: []
            };

            var isValidDistribution = function(k) {
                //validate the distribution. The sum of k values should be an even number in order to create a valid network
                var valid_k = false, sum_k_val = 0;

                for (i in k) {
                    sum_k_val += k[i];
                }

                if (sum_k_val % 2 == 0) {
                    valid_k = true;
                }
                console.log("sum: "+sum_k_val);

                return valid_k;
            };

            //create a vector with the desired distribution
            if(distribution_function == _distribution.POISSON) {
                //generate a vector of size N with poisson distribution
                var lambda = distribution_argument;

                var valid_k = false;
                var k;
                while(!valid_k) {
                    k = [];
                    for (i=0; i<N; i++) {
                        k.push(RandGen.rpoisson(lambda));
                    }

                    //validate the distribution. The sum of k values should be an even number in order to create a valid network
                    valid_k = isValidDistribution(k);
                }
            }
            else if(distribution_function == _distribution.POWER_LAW) {
                //generate a vector of size N with power-law distribution
                //using transformation method: http://cs.brynmawr.edu/Courses/cs380/spring2013/section02/slides/10_ScaleFreeNetworks.pdf
                var alpha = distribution_argument;

                var valid_k = false;
                var k, rand_value;
                var exp = -1/(alpha - 1);
                while(!valid_k) {
                    k = [];
                    for (i=0; i<N; i++) {
                        rand_value = Math.random();
                        k.push(
                                Math.round(Math.pow((1 - rand_value), exp))
                              );
                    }

                    //validate the distribution. The sum of k values should be an even number in order to create a valid network
                    valid_k = isValidDistribution(k);
                }

                var exp_ml = _power_law_exponent_estimation.maximumLikelihood(k);
                console.log(exp_ml);
            }
            else {
                //not valid distribution
                return null;
            }

            //draw the distribution histograms
            _chart.draw_pdf_histogram(k);
            _chart.draw_ccdf_histogram(k);

            //create a network with the defined distribution
            _core.create_network(k, function(net) {
                if(!net) {
                    return null;
                }

                var network_txt = _core.create_text_network(net);
                _url_handler.showFileLink(network_txt);

                var network = net.network;
                var edges = net.edges;

                if(N < 1500) {
                    $("._graph-box").removeClass("hidden");
                    //gui graph will be created only if its possible to visualize it. N < 1500
                    var i = 0;
                    for (node_id in network) {
                        _gui.graph_network.nodes.push({
                            id: 'n' + i,
                            label: 'Node ' + (i+1),
                            x: Math.random(),
                            y: Math.random(),
                            size: k[i],
                            color: '#666'
                        });
                        i++;
                    }

                    for (i = 0; i < edges.length; i++) {
                        _gui.graph_network.edges.push({
                            id: 'e' + i,
                            source: 'n' + edges[i][0],
                            target: 'n' + edges[i][1],
                            size: Math.random(),
                            color: '#ccc'
                        });
                    }
                }
                else {
                    $("._graph-box").addClass("hidden");
                }

                if(callback) callback();
            });
        },

        /*
         * Basic initialization of the sigma structure
         */
        init_graph: function() {
            _gui.sigma_structure = new sigma({
                    container: _gui.selectors.complex_network_id,
                    settings: {
                            defaultNodeColor: '#ec5148'
                        }
            });
        },

        /*
         * draw the network using sigma library
         */
        show: function() {
            //clear previous graph
            _gui.sigma_structure.graph.clear();

            //show new graph
            _gui.sigma_structure.graph.read(_gui.graph_network);
            _gui.sigma_structure.refresh();
        }
    };

    var _public = {
        init: function(options) {
            _gui.selectors = options;
            _gui.init_events();
            _gui.init_graph();
            _gui.create_graph(500, _distribution.POISSON, 5, function() {
                _gui.show();
            });
            _chart.init();
        }
    };

    return _public;
})();
