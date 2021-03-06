/** 
* @version 1.4.12
* @license MIT
*/
(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<nav ng-if="pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></nav>');
}]);


ng.module('smart-table')
    .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', '$log', function StTableController($scope, $parse, $filter, $attrs, $log) {
        var scopeVarSetter = getScopeVarSetter();
        var orderBy = $filter('orderBy');
        var filter = $filter('filter');
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
        var srcGetter;
        var safeCopy;

        if (angular.isDefined($attrs.stSrc)) {
            srcGetter = getSrcGetter();
            safeCopy = srcGetter($scope);

            // Initial value of scope var is a (shallow) copy of source data
            scopeVarSetter($scope, [].concat(safeCopy));

            // Watch source data. Update table when new array is set or array length changes.
            $scope.$watchGroup([function() {
                var data = srcGetter($scope);
                return data ? data.length : 0;
            }, function() {
                return srcGetter($scope);
            }], function(newValues, oldValues) {
                if (oldValues[0] !== newValues[0] || oldValues[1] !== newValues[1]) {
                    updateSafeCopy();
                }
            });
        }

        function getScopeVarSetter() {
          var defaultValue = 'tableData';
          var attValue = $attrs.stTable;
          if (attValue === '') {
            $log.error('st-table has an empty value. No scope variable name is defined. Defaults to \'' + defaultValue + '\'');
            attValue = defaultValue;
          }
          return $parse(attValue).assign;
        }

        function getSrcGetter() {
          if (angular.isUndefined($attrs.stSrc) || $attrs.stSrc === '') {
            return function() {
                $log.error('Attribute \'st-src\' is undefined!');
            }
          }
          return $parse($attrs.stSrc);
        }

        function updateSafeCopy() {
          safeCopy = srcGetter($scope);
          tableState.pagination.start = 0;
          if (pipeAfterSafeCopy === true) {
            ctrl.pipe();
          }
          $scope.$broadcast('st-safeSrcChanged', null);
        }

        /**
         * sort the rows
         * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
         * @param [reverse] - if you want to reverse the order
         */
        this.sortBy = function sortBy(predicate, reverse) {
            tableState.sort.predicate = predicate;
            tableState.sort.reverse = reverse === true;

            // For change detection, see https://github.com/lorenzofox3/Smart-Table/issues/285
            if (ng.isFunction(predicate)) {
              tableState.sort.functionName = predicate.name;
            } else {
              delete tableState.sort.functionName;
            }

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
                tableState.filters = Object.create(null);
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

            if (!safeCopy) {
                filtered = [];
            } else {
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
            }
            scopeVarSetter($scope, filtered);
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
            if (!safeCopy) return [];

            return safeCopy
                .map(function(el) {
                    return getter(el);
                })
                .sort(function(o1, o2) {
                  if (typeof o1 === 'string') {
                    return o1.localeCompare(o2);
                  } else {
                    return (o1 > o2) ? 1 :
                        (o1 < o2) ? -1 : 0;
                  }
                })
                .filter(function(el) {
                    if (seen === undefined || seen !== el) {
                        seen = el;
                        return true;
                    }
                    return false;
                });
        };

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
                var currVal;
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
                // 'keyup' and currVal check where added for IE9 support.
                element.bind('input keyup', function (evt) {
                    evt = evt.originalEvent || evt;

                    // IE9 support. Added because extra event 'keyup'.
                    var val = evt.target.value;
                    if (val === currVal) return;
                    currVal = val;

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
    .directive('stSelectFilter', ['$interpolate', '$log', function ($interpolate, $log) {
        return {
            replace: true,
            require: '^stTable',
            scope: {
                predicate: '=?stSelectFilter',
                attrOptions: '=?options',
                attSelected: '=?selected',
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

                if (attr.comparator) {
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
                    if (angular.isUndefined(scope.predicate) || scope.predicate === '') {
                        $log.error('Empty predicate value not allowed for st-select-filter');
                    }
                    if (scope.predicate === '$') {
                        $log.error('Predicate value \'$\' only allowed for st-select-filter when combined with attribute \'options\'');
                    }

                    // if not explicitly passed then determine the options by looking at the content of the table.
                    scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));

                    // when the table data is updated, also update the options
                    scope.$on('st-safeSrcChanged', function() {
                        scope.options = getOptionObjectsFromArray(ctrl.getUniqueValues(scope.predicate));

                        // if currently selected filter value is no longer an option in the list, reset filter.
                        if (scope.selected !== null && !scope.options.some(function(option) {
                                return option.value === scope.selected;
                            })) {
                            scope.selected = null;
                            tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                        }
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
                    if (angular.isUndefined(scope.predicate) || scope.predicate === '') {
                      $log.error('Empty predicate not allowed, assign a predicate value to st-select-filter. Use \'$\' to filter globally.');
                      return;
                    }
                    tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                    scope.$parent.$digest();
                });

                //table state -> view
                scope.$watch(function () {
                    return filter.predicateObject;
                }, function (newValue, oldValue) {
                    if (newValue !== oldValue) {
                        var predicateObject = newValue;
                        var predicateExpression = scope.predicate || '$';
                        if (predicateObject && predicateObject[predicateExpression] !== element[0].value) {
                            scope.attSelected = predicateObject[predicateExpression] || '';
                        }
                    }
                }, true);

                // view --> table state
                scope.$watch(function () {
                    return scope.attSelected;
                }, function (newValue, oldValue) {
                    if (newValue === oldValue) {

                        // if new and old value are the same than this is the initial call. If a value is set than this a default or pre selected.
                        // here where not going to use applyFilter because we're still in the initialization phase.
                        if (newValue && newValue !== '') {
                            var predicateExpression = scope.predicate || '$';
                            filter.predicateObject[predicateExpression] = newValue;
                            scope.selected = newValue;
                        }
                    } else {
                        var validOption = scope.options.some(function(option) {
                            return option.value === newValue;
                        });

                        scope.attSelected = validOption ? newValue : null;
                        if (scope.selected !== scope.attSelected) {
                            scope.selected = scope.attSelected;
                            tableCtrl.applyFilter(scope.selected, scope.predicate, filter);
                        }
                    }
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
        stDisplayedPages: '=?',
        stPageChange: '&'
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
          var prevPage = scope.currentPage;
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

          if (prevPage!==scope.currentPage) {
            scope.stPageChange({newPage: scope.currentPage});
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function (newValue, oldValue) {
          if (newValue !== oldValue) {
            scope.selectPage(1);
          }
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        if(!ctrl.tableState().pagination.number){
          ctrl.slice(0, scope.stItemsByPage);
        }
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
        },

        post: function (scope, element, attrs, ctrl) {
          ctrl.pipe();
        }
      }
    };
  });

})(angular);