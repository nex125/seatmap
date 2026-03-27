'use strict';

var react = require('react');

"use strict";
const useIsomorphicLayoutEffect = typeof window !== "undefined" && (window.document?.createElement || window.navigator?.product === "ReactNative") ? react.useLayoutEffect : react.useEffect;

exports.useIsomorphicLayoutEffect = useIsomorphicLayoutEffect;
//# sourceMappingURL=useIsomorphicLayoutEffect.js.map
