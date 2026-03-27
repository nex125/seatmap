'use strict';

var react = require('react');
var extend = require('../helpers/extend.js');

"use strict";
function useExtend(objects) {
  react.useMemo(() => {
    extend.extend(objects);
  }, [objects]);
}

exports.useExtend = useExtend;
//# sourceMappingURL=useExtend.js.map
