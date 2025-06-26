sap.ui.define([], function() {
    "use strict";
    return {
        xFlagToBool: function(sValue) {
            return sValue === "X";
        },

        /**
         * Formatea un número agregando separadores de miles y dos decimales.
         * Ejemplo: 4500.1 → 4,500.10
         */
        formatNumberWithCommas: function(nNumber) {
            if (nNumber === undefined || nNumber === null || nNumber === "") {
                return "";
            }
            var num = parseFloat(nNumber);
            if (isNaN(num)) return nNumber;
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    };
});