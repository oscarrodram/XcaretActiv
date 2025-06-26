sap.ui.define([
    "sap/ui/core/UIComponent",
    "comxcaretrepactiv/comxcaretrepactiv/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("comxcaretrepactiv.comxcaretrepactiv.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            var _sFixedAssetsReportServiceUrl =  "https://experiencias-xcaret-parques-s-a-p-i-de-c-v--xc-btpdev-15aca4ac6.cfapps.us10-001.hana.ondemand.com/FixedAssetReport";

            // === Selección dinámica de endpoint según el entorno ===
            var currentUrl = window.location.href || "";
            if (currentUrl.includes("xc-btpdev")) {
                _sFixedAssetsReportServiceUrl = "https://experiencias-xcaret-parques-s-a-p-i-de-c-v--xc-btpdev-15aca4ac6.cfapps.us10-001.hana.ondemand.com/FixedAssetReport";
            } else if (currentUrl.includes("qas-btp")) {
                _sFixedAssetsReportServiceUrl = "https://node.cfapps.us10-001.hana.ondemand.com/FixedAssetReport";
            }

            // Fetch inicial al iniciar la app
            fetch(_sFixedAssetsReportServiceUrl)
                .then(response => response.json())
                .then(data => {
                    this.setResultList(data.result);
                })
                .catch(err => {
                    console.error("Error al cargar datos iniciales:", err);
                });
        },

        setResultList: function (aList) { this.oResultList = aList; },
        getResultList: function () { return this.oResultList || []; },

        getOptions: function (sInputId, oCurrentFilters) {
            // Mapeo actualizado para todos los filtros MultiInput de tu vista
            var mFieldMap = {
                "multiInputDocumentoMaterial": "MBLRN",
                "multiInputMaterial": "MATERIAL_NAME",
                "multiInputTipoProgramacion": "PROGN",
                "multiInputCreadoPor": "CREATION_NAME"
            };
            var sField = mFieldMap[sInputId];
            if (!sField) return [];
            var aResults = this.getResultList();

            // Filtrado dinámico según los filtros actuales
            if (oCurrentFilters) {
                aResults = aResults.filter(function (item) {
                    return Object.keys(oCurrentFilters).every(function (key) {
                        var filtro = oCurrentFilters[key];
                        if (!filtro || (Array.isArray(filtro) && filtro.length === 0)) {
                            return true;
                        }
                        if (Array.isArray(filtro)) {
                            return filtro.map(String).includes(String(item[key]));
                        } else {
                            return String(item[key]) === String(filtro);
                        }
                    });
                });
            }

            // Opciones únicas (text siempre como string)
            var aOptions = [];
            var oSeen = {};
            aResults.forEach(function (item) {
                var key = item[sField];
                var text = (key !== undefined && key !== null) ? String(key) : "";
                // Lógica especial para "Creado por"
                if (sInputId === "multiInputCreadoPor") {
                    var name = item["CREATION_NAME"] || "";
                    var lname = item["CREATION_LNAME"] || "";
                    text = (name + " " + lname).trim() || text;
                }
                if (text && !oSeen[key]) {
                    oSeen[key] = true;
                    aOptions.push({ key: key, text: text });
                }
            });

            return aOptions;
        }
    });
});