/** 
* @version 1.4.8
* @license MIT
*/
(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<div class="pagination" ng-if="pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></div>');
}]);


ng.module('smart-table')
    .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', function StTableController($scope, $parse, $filter, $attrs) {
        var propertyName = $attrs.stTable;
        var displayGetter = $parse(propertyName);
        var displaySetter = displayGetter.assign;
        var safeGetter;
        var orderBy = $filter('orderBy');
        var filter = $filter('filter');
        var safeCopy = copyRefs(displayGetter($scope));
        var tableState = {
            sort: {},
            filters: {},
            pagination: {
                start: 0
            }
        };
        var pipeAfterSafeCopy = true;
        var ctrl = this;
        var lastSelected;



        /**
         * sort the rows
         * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
         * @param [reverse] - if you want to reverse the order
         */
        this.sortBy = function sortBy(predicate, reverse) {
            tableState.sort.predicate = predicate;
            tableState.sort.reverse = reverse === true;
            tableState.pagination.start = 0;
            return this.pipe();
        };

        /**
         * Register a filter
         * @param {String} name - name of filter
         * @param {function(actual, expected)|true|undefined} comparator Comparator which is used in determining if the
         *     expected value (from the filter expression) and actual value (from the object in the array) should be
         *     considered a match. See also https://docs.angularjs.org/api/ng/filter/filter.
         * @param {String|undefined} emptyValue Value that represents a 'no filter' value.
         * @returns {Object} - filter object with predicateObject and comparator.
         */
        this.registerFilter = function(name, comparator, emptyValue) {
            if (tableState.filters===undefined) {
                tableState.filters = {};
            }
            var filter = tableState.filters[name];
            if (filter===undefined) {
                filter = {
                    comparator: comparator,
                    predicateObject: {},
                    emptyValue: (emptyValue!==undefined ? emptyValue : '')
                };
                tableState.filters[name] = filter;
            }
            return filter;
        };

        /**
         * search matching rows
         * @deprecated this method is only meant for backwards compatibility.
         * @param {String} input - the input string
         * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
         */
        this.search = function search(input, predicate) {
            var searchFilter = this.registerFilter('search'); // make sure 'search' filter exists, get copy if already registered.
            this.applyFilter(input, predicate, searchFilter);
        };

        /**
         * apply filter to row data
         * @param {String} input - the input string
         * @param {String} predicate - the property name against you want to check the match, otherwise it will search on all properties
         * @param {Object} filter - the filter that is going to be applied
         */
        this.applyFilter = function(input, predicate, filter) {
            var prop = predicate || '$';
            filter.predicateObject[prop] = input;
            // to avoid to filter out null value
            if (input===filter.emptyValue) {
                delete filter.predicateObject[prop];
            }
            tableState.pagination.start = 0;
            return this.pipe();
        };

        /**
         * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
         */
        this.pipe = function pipe() {
            var pagination = tableState.pagination;

            var filtered = safeCopy;
            angular.forEach(tableState.filters, function(filterObj) {
                var predicateObject = filterObj.predicateObject;
                if (Object.keys(predicateObject).length > 0) {
                    filtered = filter(filtered, predicateObject, filterObj.comparator);
                }
            });

            if (tableState.sort.predicate) {
                filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
            }
            if (pagination.number !== undefined) {
                pagination.numberOfPages = filtered.length > 0 ? Math.ceil(filtered.length / pagination.number) : 1;
                pagination.start = pagination.start >= filtered.length ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
                filtered = filtered.slice(pagination.start, pagination.start + parseInt(pagination.number));
            }
            displaySetter($scope, filtered);
        };

        /**
         * select a dataRow (it will add the attribute isSelected to the row object)
         * @param {Object} row - the row to select
         * @param {String} [mode] - "single" or "multiple" (multiple by default)
         */
        this.select = function select(row, mode) {
            var rows = safeCopy;
            var index = rows.indexOf(row);
            if (index !== -1) {
                if (mode === 'single') {
                    row.isSelected = row.isSelected !== true;
                    if (lastSelected) {
                        lastSelected.isSelected = false;
                    }
                    lastSelected = row.isSelected === true ? row : undefined;
                } else {
                    rows[index].isSelected = !rows[index].isSelected;
                }
            }
        };

        /**
         * take a slice of the current sorted/filtered collection (pagination)
         *
         * @param {Number} start - start index of the slice
         * @param {Number} number - the number of item in the slice
         */
        this.slice = function splice(start, number) {
            tableState.pagination.start = start;
            tableState.pagination.number = number;
            return this.pipe();
        };

        /**
         * return the current state of the table
         * @returns {{sort: {}, search: {}, filters: {}, pagination: {start: number}}}
         */
        this.tableState = function getTableState() {

            // for backwards compatibility, make sure tableState.search exists.
            tableState.search = tableState.filters.search ? tableState.filters.search : {};

            return tableState;
        };

        /**
         * Use a different filter function than the angular FilterFilter
         * @param filterName the name under which the custom filter is registered
         */
        this.setFilterFunction = function setFilterFunction(filterName) {
            filter = $filter(filterName);
        };

        /**
         *User a different function than the angular orderBy
         * @param sortFunctionName the name under which the custom order function is registered
         */
        this.setSortFunction = function setSortFunction(sortFunctionName) {
            orderBy = $filter(sortFunctionName);
        };

        /**
         * Usually when the safe copy is updated the pipe function is called.
         * Calling this method will prevent it, which is something required when using a custom pipe function
         */
        this.preventPipeOnWatch = function preventPipe() {
            pipeAfterSafeCopy = false;
        };

        /**
         * Convenient method to determine the unique values for a given predicate.
         * This method is used in stSelectFilter to determine the options for the select element.
         */
        this.getUniqueValues = function(predicate) {
            var seen;
            var getter = $parse(predicate);
            return safeCopy
                .map(function(el) {
                    return getter(el);
                })
                .sort()
                .filter(function(el) {
                    if (seen === undefined || seen !== el) {
                        seen = el;
                        return true;
                    }
                    return false;
                });
        };



        // The constructor logic is moved down to appear under the definitions of the member functions. This to make
        // sure the pipe function is defined before we attempt to call it.

        function copyRefs(src) {
            return src ? [].concat(src) : [];
        }

        function updateSafeCopy() {
            safeCopy = copyRefs(safeGetter($scope));
            if (pipeAfterSafeCopy === true) {
                ctrl.pipe();
            }
        }

        if ($attrs.stSafeSrc) {
            safeGetter = $parse($attrs.stSafeSrc);

            $scope.$watchGroup([function() {
                var safeSrc = safeGetter($scope);
                return safeSrc ? safeSrc.length : 0;
            }, function() {
                return safeGetter($scope);
            }], function(newValues, oldValues) {
                if (oldValues[0] !== newValues[0] || oldValues[1] !== newValues[1]) {
                    updateSafeCopy();
                    $scope.$broadcast('st-safeSrcChanged', null);
                }
            });

            // make sure that stTable is defined on $scope. Either implicitly by calling updateSafeCopy or explicitly.
            // by calling displaySetter.
            updateSafeCopy();
            if (pipeAfterSafeCopy !== true) {
                displaySetter($scope, safeCopy);
            }
        }
    }])
    .directive('stTable', function () {
        return {
            restrict: 'A',
            controller: 'stTableController',
            link: function (scope, element, attr, ctrl) {

                if (attr.stSetFilter) {
                    ctrl.setFilterFunction(attr.stSetFilter);
                }

                if (attr.stSetSort) {
                    ctrl.setSortFunction(attr.stSetSort);
                }
            }
        };
    });

ng.module('smart-table')
    .directive('stSearch', ['$timeout', function ($timeout) {
        return {
            require: '^stTable',
            scope: {
                predicate: '=?stSearch'
            },
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var promise = null;
                var throttle = attr.stDelay || 400;
                var filter = ctrl.registerFilter('search');

                scope.$watch('predicate', function (newValue, oldValue) {
                    if (newValue !== oldValue) {
                        delete filter.predicateObject[oldValue];
                        tableCtrl.applyFilter(element[0].value, newValue, filter);
                    }
                });

                //table state -> view
                scope.$watch(function () {
                    return filter.predicateObject;
                }, function (newValue) {
                    var predicateObject = newValue;
                    var predicateExpression = scope.predicate || '$';
                    if (predicateObject && predicateObject[predicateExpression] !== element[0].value) {
                        element[0].value = predicateObject[predicateExpression] || '';
                    }
                }, true);

                // view -> table state
                element.bind('input', function (evt) {
                    evt = evt.originalEvent || evt;
                    if (promise !== null) {
                        $timeout.cancel(promise);
                    }
                    promise = $timeout(function () {
                        tableCtrl.applyFilter(evt.target.value, scope.predicate, filter);
                        promise = null;
                    }, throttle);
                });
            }
        };
    }]);

ng.module('smart-table')
    .directive('stSelectFilter', ['$interpolate', function ($interpolate) {
        return {
            replace: true,
            require: '^stTable',
            scope: {
                predicate: '=?stSelectFilter',
                attrOptions: '=?options',
                selected: '=?value',
                comparator: '&'
            },

            template: function(tElement, tAttrs) {
                var emptyLabel = tAttrs.emptyLabel ? tAttrs.emptyLabel : '';
                return '<select data-ng-model="selected" data-ng-options="option.value as option.label for option in options">' +
                       '<option value="">' + emptyLabel + '</option></select>';
            },
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var filter;
                var FILTER_NAME = 'selectFilter';

                if (attr.hasOwnProperty('comparator')) {

                    // We have to use a getter to get the actual function?!
                    var comparator = scope.comparator();

                    // Custom filter name for comparator, standard name plus name of comparator function.
                    // This way we prevent making multiple filters for the same comparator.
                    var customFilterName = FILTER_NAME + '_' + comparator.name;

                    filter = ctrl.registerFilter(customFilterName , comparator, null);
                } else {

                   // default we use strict comparison
                   filter = ctrl.registerFilter(FILTER_NAME, true, null);
                }

                if (scope.attrOptions) {
                    if (scope.attrOptions.length>0 && (typeof scope.attrOptions[0] === 'object')) {

                        // options as array of objects, eg: [{label:'green', value:true}, {label:'red', value:false}]
                        scope.options = scope.attrOptions.slice(0); // copy values
                    } else {

                        // options as simple array, eg: ['apple', 'banana', 'cherry', 'strawberry', 'mango', 'pineapple'];
                        scope.options = getOptionObjectsFromArray(scope.attrOptions);
                    }
                } else {

                    // if not explicitly passed then determine the options by looking at the content of the table.
                    scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));

                    // when the table data is updated, also update the options
                    scope.$on('st-safeSrcChanged', function() {
                        scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));
                    });
                }

                // if a label expression is passed than use this to create custom labels.
                if (attr.label) {
                    var strTemplate = attr.label.replace('[[', '{{').replace(']]', '}}');
                    var template = $interpolate(strTemplate);
                    scope.options.forEach(function(option) {
                        option.label = template(option);
                    });
                }

                element.on('change', function() {
                    tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                    scope.$parent.$digest();
                });
            }
        };
    }]);

function getOptionObjectsFromArray(options) {
    return options.map(function(val) {
        return {label: val, value: val};
    });
}


ng.module('smart-table')
  .directive('stSelectRow', function () {
    return {
      restrict: 'A',
      require: '^stTable',
      scope: {
        row: '=stSelectRow'
      },
      link: function (scope, element, attr, ctrl) {
        var mode = attr.stSelectMode || 'single';
        element.bind('click', function () {
          scope.$apply(function () {
            ctrl.select(scope.row, mode);
          });
        });

        scope.$watch('row.isSelected', function (newValue) {
          if (newValue === true) {
            element.addClass('st-selected');
          } else {
            element.removeClass('st-selected');
          }
        });
      }
    };
  });

ng.module('smart-table')
  .directive('stSort', ['$parse', function ($parse) {
    return {
      restrict: 'A',
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {

        var predicate = attr.stSort;
        var getter = $parse(predicate);
        var index = 0;
        var classAscent = attr.stClassAscent || 'st-sort-ascent';
        var classDescent = attr.stClassDescent || 'st-sort-descent';
        var stateClasses = [classAscent, classDescent];
        var sortDefault;

        if (attr.stSortDefault) {
          sortDefault = scope.$eval(attr.stSortDefault) !== undefined ?  scope.$eval(attr.stSortDefault) : attr.stSortDefault;
        }

        //view --> table state
        function sort() {
          index++;
          predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
          if (index % 3 === 0 && attr.stSkipNatural === undefined) {
            //manual reset
            index = 0;
            ctrl.tableState().sort = {};
            ctrl.tableState().pagination.start = 0;
            ctrl.pipe();
          } else {
            ctrl.sortBy(predicate, index % 2 === 0);
          }
        }

        element.bind('click', function sortClick() {
          if (predicate) {
            scope.$apply(sort);
          }
        });

        if (sortDefault) {
          index = attr.stSortDefault === 'reverse' ? 1 : 0;
          sort();
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().sort;
        }, function (newValue) {
          if (newValue.predicate !== predicate) {
            index = 0;
            element
              .removeClass(classAscent)
              .removeClass(classDescent);
          } else {
            index = newValue.reverse === true ? 2 : 1;
            element
              .removeClass(stateClasses[index % 2])
              .addClass(stateClasses[index - 1]);
          }
        }, true);
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPagination', function () {
    return {
      restrict: 'EA',
      require: '^stTable',
      scope: {
        stItemsByPage: '=?',
        stDisplayedPages: '=?'
      },
      templateUrl: function (element, attrs) {
        if (attrs.stTemplate) {
          return attrs.stTemplate;
        }
        return 'template/smart-table/pagination.html';
      },
      link: function (scope, element, attrs, ctrl) {

        scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : 10;
        scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : 5;

        scope.currentPage = 1;
        scope.pages = [];

        function redraw() {
          var paginationState = ctrl.tableState().pagination;
          var start = 1;
          var end;
          var i;
          scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

          start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
          end = start + scope.stDisplayedPages;

          if (end > paginationState.numberOfPages) {
            end = paginationState.numberOfPages + 1;
            start = Math.max(1, end - scope.stDisplayedPages);
          }

          scope.pages = [];
          scope.numPages = paginationState.numberOfPages;

          for (i = start; i < end; i++) {
            scope.pages.push(i);
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function () {
          scope.selectPage(1);
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        //select the first page
        ctrl.slice(0, scope.stItemsByPage);
      }
    };
  });

ng.module('smart-table')
    .directive('stPipe', function () {
        return {
            require: 'stTable',
            scope: {
                stPipe: '='
            },
            link: {
                pre: function (scope, element, attrs, ctrl) {

                    if (ng.isFunction(scope.stPipe)) {
                        ctrl.preventPipeOnWatch();
                        ctrl.pipe = function () {
                            return scope.stPipe(ctrl.tableState(), ctrl);
                        }
                    }
                }
            }
        };
    });

})(angular);