sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Dialog",
    "sap/m/List",
    "sap/m/CustomListItem",
    "sap/m/HBox",
    "sap/m/CheckBox",
    "sap/m/Text",
    "sap/m/Button",
    "sap/m/StandardListItem",
    "comxcaretrepactiv/comxcaretrepactiv/js/formatter",
    "sap/ui/export/Spreadsheet"
], (Controller, JSONModel, Dialog, List, CustomListItem, HBox, CheckBox, Text, Button, StandardListItem, formatter, Spreadsheet) => {
    "use strict";

    return Controller.extend("comxcaretrepactiv.comxcaretrepactiv.controller.Main", {

        formatter: formatter, // Referencia al módulo de formateadores

        // Definición de todos los filtros disponibles en la vista
        aAllFilters: [
            { vbox: "vboxFiltroFechaContabilizacion", label: "Fecha de contabilización", type: "date" },
            { vbox: "vboxFiltroFechaCreacion", label: "Fecha de creación", type: "date" },
            { vbox: "vboxFiltroDocumentoMaterial", label: "Documento material", type: "multi" },
            { vbox: "vboxFiltroMaterial", label: "Material", type: "multi" },
            { vbox: "vboxFiltroTipoProgramacion", label: "Tipo de programación", type: "multi" },
            { vbox: "vboxFiltroCreadoPor", label: "Creado por", type: "multi" }
            // Si necesitas agregar los filtros comentados, solo descoméntalos aquí y en la vista
            // { vbox: "vboxFiltroResponsableRecepcion", label: "Responsable de recepción", type: "multi" },
            // { vbox: "vboxFiltroLocacion", label: "Locación", type: "multi" }
        ],

        _sFixedAssetsReportServiceUrl: "https://experiencias-xcaret-parques-s-a-p-i-de-c-v--xc-btpdev-15aca4ac6.cfapps.us10-001.hana.ondemand.com/FixedAssetReport",

        _sSignsPdfServiceUrl: "https://experiencias-xcaret-parques-s-a-p-i-de-c-v--xc-btpdev-15aca4ac6.cfapps.us10-001.hana.ondemand.com/ImageSignItem",

        /**
         * Genera una cadena de filtro OData basada en el valor de un control de entrada (Input o MultiInput).
         * @param {sap.ui.core.Control} oView - La vista actual.
         * @param {string} sInputId - El ID del control de entrada.
         * @param {string} sODataField - El nombre del campo OData a filtrar.
         * @param {string} [sOperator='EQ'] - El operador OData a usar (ej., 'EQ', 'GE', 'LE').
         * @returns {string|null} La cadena de filtro OData o null si no hay valor.
         */
        getODataFilter: function (oView, sInputId, sODataField, sOperator = 'EQ') {
            var oMultiModel = oView.getModel("multiSelect");
            // Obtiene los valores seleccionados del modelo para MultiInput
            var aValues = oMultiModel && oMultiModel.getProperty("/" + sInputId);
            var oInput = oView.byId(sInputId);

            // Manejo específico para controles sap.m.MultiInput
            if (oInput && oInput.isA && oInput.isA("sap.m.MultiInput")) {
                if (Array.isArray(aValues) && aValues.length > 0) {
                    // Si hay múltiples valores, construye una cláusula 'IN'
                    var sInClause = aValues.map(function (val) {
                        return "'" + String(val).replace(/'/g, "''") + "'";
                    }).join(",");
                    return sODataField + " IN (" + sInClause + ")";
                }
                return null; // No hay valores seleccionados para MultiInput
            }

            // Manejo para otros tipos de controles de entrada (ej., sap.m.Input, sap.m.DatePicker)
            var sValue = oInput && oInput.getValue && oInput.getValue();
            if (sValue) {
                // Para valores individuales, usa el operador especificado
                return sODataField + " " + sOperator + " '" + String(sValue).replace(/'/g, "''") + "'";
            }
            return null; // No hay valor en el control de entrada
        },

        /**
         * Se ejecuta al inicializar el controlador.
         * Inicializa modelos de visibilidad de filtros y columnas, y dispara la búsqueda inicial.
         */
        onInit: function () {
            this._bIsFirstSearch = true;

            // === Selección dinámica de endpoint según el entorno ===
            var currentUrl = window.location.href || "";
            if (currentUrl.includes("xc-btpdev")) {
                this._sFixedAssetsReportServiceUrl = "https://experiencias-xcaret-parques-s-a-p-i-de-c-v--xc-btpdev-15aca4ac6.cfapps.us10-001.hana.ondemand.com/FixedAssetReport";
                this._sSignsPdfServiceUrl = "https://experiencias-xcaret-parques-s-a-p-i-de-c-v--xc-btpdev-15aca4ac6.cfapps.us10-001.hana.ondemand.com/ImageSignItem";

            } else if (currentUrl.includes("qas-btp")) {
                this._sFixedAssetsReportServiceUrl = "https://node.cfapps.us10-001.hana.ondemand.com/FixedAssetReport";
                this._sSignsPdfServiceUrl = "https://node.cfapps.us10-001.hana.ondemand.com/ImageSignItem";
            } else if (currentUrl.includes("prd")) {
                this._sFixedAssetsReportServiceUrl = "https://node-api-prd.cfapps.us10-001.hana.ondemand.com";
                this._sSignsPdfServiceUrl = "https://node.cfapps.us10-001.hana.ondemand.com/ImageSignItem";
            }

            // Inicializa el modelo 'visibility' para controlar la visibilidad de los filtros
            var oVisibility = {};
            this.aAllFilters.forEach(function (f) {
                // Convierte vboxFiltroProyecto => filtroProyecto para coincidir con el binding en el XML
                var sKey = f.vbox.replace(/^vbox/, "");
                sKey = sKey.charAt(0).toLowerCase() + sKey.slice(1);
                oVisibility[sKey] = true;
            });
            this.getView().setModel(new sap.ui.model.json.JSONModel(oVisibility), "visibility");

            // Inicializa el modelo 'multiSelect' con arrays vacíos SOLO para los filtros de tipo MultiInput (type: "multi")
            var oInitialMultiSelectData = {};
            this.aAllFilters.forEach(function (filter) {
                if (filter.type === "multi") {
                    // El ID del MultiInput sigue la convención: multiInput + <Sufijo>
                    // Ejemplo: vboxFiltroProyecto -> multiInputProyecto
                    var sInputId = "multiInput" + filter.vbox.replace("vboxFiltro", "");
                    oInitialMultiSelectData[sInputId] = [];
                }
            });
            this.getView().setModel(new sap.ui.model.json.JSONModel(oInitialMultiSelectData), "multiSelect");

            this.getView().setModel(new sap.ui.model.json.JSONModel(oInitialMultiSelectData), "multiSelect");

            // Dispara la búsqueda inicial de datos
            this.onSearchFixedAssets();

            // Definición de todas las columnas de la tabla para control de visibilidad y exportación
            this.aAllColumns = [
                { id: "colFechaContabilizacion", label: "Fecha de contabilización" },
                { id: "colDocMaterial", label: "Documento material" },
                { id: "colPosDocumento", label: "Posición documento" },
                { id: "colContador", label: "Contador" },
                { id: "colEjercicioDoc", label: "Ejercicio documento" },
                { id: "colProveedor", label: "Proveedor" },
                { id: "colContrato", label: "Contrato" },
                { id: "colNoProgramacion", label: "No. Programación" },
                { id: "colPosProg", label: "Posición Programación" },
                { id: "colIdProyecto", label: "ID Proyecto" },
                { id: "colProyecto", label: "Proyecto" },
                { id: "colMaterial", label: "Material" },
                { id: "colNombre", label: "Nombre" },
                { id: "colCantidad", label: "Cantidad" },
                { id: "colUm", label: "Unidad de Medida" },
                { id: "colPrecioUnitario", label: "Precio Unitario" },
                { id: "colMoneda", label: "Moneda" },
                { id: "colCategoria", label: "Categoría" },
                { id: "colFamilia", label: "Familia" },
                { id: "colMarca", label: "Marca" },
                { id: "colModelo", label: "Modelo" },
                { id: "colDimensiones", label: "Dimensiones" },
                { id: "colIndEstandar", label: "Ind. Estándar" },
                { id: "colIndActivoFijo", label: "Ind. Activo Fijo" },
                { id: "colPatrimonio", label: "Patrimonio" },
                { id: "colEspecial", label: "Especial" },
                { id: "colFfe", label: "FFE" },
                { id: "colDivision", label: "División" },
                { id: "colArea", label: "Área" },
                { id: "colUbicacion", label: "Ubicación" },
                { id: "colSubUbicacion", label: "Sububicación" },
                { id: "colSuministrador", label: "Suministrador" },
                { id: "colVista", label: "Vista" },
                { id: "colEstatusSincro", label: "Estatus Sincronización" },
                { id: "colActivoFijo", label: "Activo Fijo" },
                { id: "colNoSerie", label: "No. Serie" },
                { id: "colCreadoPor", label: "Creado por" },
                { id: "colModificadoPor", label: "Modificado por" },
                { id: "colModificadoEl", label: "Modificado el" }
            ];

            // Inicializa el modelo 'columnVisibility' para controlar la visibilidad de las columnas de la tabla
            var oColVis = {};
            this.aAllColumns.forEach(function (col) { oColVis[col.id] = true; });
            this.getView().setModel(new sap.ui.model.json.JSONModel(oColVis), "columnVisibility");
        },

        /**
         * Realiza la búsqueda de cotizaciones basándose en los filtros actuales.
         * Construye la URL OData y actualiza la tabla y el total.
         */
        /*
        onSearchFixedAssets: function () {
            var oView = this.getView();
            var aFilters = [];

            // === Mapeo de campos ===
            var oCampos = [
                { inputId: "multiInputDocumentoMaterial", odata: "ASEG.MBLRN" },
                { inputId: "multiInputMaterial", odata: "MARA.NAME" },
                { inputId: "multiInputTipoProgramacion", odata: "ASEG.PROGN" }
            ];

            // === Filtros por fechas ===
            var drsFechaContabilizacion = oView.byId("dateRangeContabilizacion");
            if (drsFechaContabilizacion) {
                var dFrom = drsFechaContabilizacion.getDateValue();
                var dTo = drsFechaContabilizacion.getSecondDateValue();
                if (dFrom && dTo) {
                    var sFrom = dFrom.toISOString().slice(0, 10);
                    var sTo = dTo.toISOString().slice(0, 10);
                    aFilters.push("(AKPF.BUDAT BETWEEN DATE '" + sFrom + "' AND DATE '" + sTo + "')");
                } else if (dFrom) {
                    var sFrom = dFrom.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sFrom + "'");
                } else if (dTo) {
                    var sTo = dTo.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sTo + "'");
                }
            }

            // Fecha de creación
            var drsFechaCreacion = oView.byId("datePickerFechaCreacion");
            if (drsFechaCreacion) {
                var dFromC = drsFechaCreacion.getDateValue();
                var dToC = drsFechaCreacion.getSecondDateValue && drsFechaCreacion.getSecondDateValue();
                if (dFromC && dToC) {
                    var sFromC = dFromC.toISOString().slice(0, 10);
                    var sToC = dToC.toISOString().slice(0, 10);
                    aFilters.push("(AKPF.BUDAT BETWEEN DATE '" + sFromC + "' AND DATE '" + sToC + "')");
                } else if (dFromC) {
                    var sFromC = dFromC.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sFromC + "'");
                } else if (dToC) {
                    var sToC = dToC.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sToC + "'");
                }
            }

            // === Filtro especial para multiInputCreadoPor con nombre y apellido ===
            var oMultiModel = oView.getModel("multiSelect");
            var aCreadoPor = oMultiModel.getProperty("/multiInputCreadoPor") || [];
            if (Array.isArray(aCreadoPor) && aCreadoPor.length > 0) {
                var aAndFilters = aCreadoPor.map(function (fullName) {
                    var partes = fullName.trim().split(" ");
                    var nombre = partes[0];
                    var apellido = partes.slice(1).join(" ");
                    nombre = String(nombre).replace(/'/g, "''");
                    apellido = String(apellido).replace(/'/g, "''");
                    return "(TUSR1.NAME EQ '" + nombre + "' AND TUSR1.LNAME EQ '" + apellido + "')";
                });
                aFilters.push(aAndFilters.join(' or '));
            }

            // === Filtros MultiInput ===
            oCampos.forEach(function (campo) {
                var filtro = this.getODataFilter(oView, campo.inputId, campo.odata);
                if (filtro) aFilters.push(filtro);
            }, this);

            // === Construcción final del filtro OData ===
            var sFilter = aFilters.length ? "$filter=" + aFilters.join(' and ') : "";
            var sUrl = this._sFixedAssetsReportServiceUrl + (sFilter ? "?" + sFilter : "");

            var that = this;
            fetch(sUrl)
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    console.log(data)
                    var oDataResult = { items: data.result };
                    var oModel = new sap.ui.model.json.JSONModel(oDataResult);
                    that.getView().byId("tablaReporteRecActivosFijos").setModel(oModel);

                    // Si necesitas el cálculo de totales, descomenta y ajusta el bloque siguiente
                    
                    //var nGrandTotal = 0;
                    //(data.result || []).forEach(function (item) {
                    //    var val = parseFloat(item.TOTAL);
                    //    if (!isNaN(val)) nGrandTotal += val;
                    //});
                    //var oTotalsModel = new sap.ui.model.json.JSONModel({ grandTotal: nGrandTotal.toFixed(2) });
                    //that.getView().setModel(oTotalsModel, "totals");
                    

                    if (oDataResult.items.length > 0) {
                        if (!that._bIsFirstSearch) {
                            sap.m.MessageToast.show("Información encontrada con los criterios de búsqueda");
                        }
                    } else {
                        if (!that._bIsFirstSearch) {
                            sap.m.MessageToast.show("No se encontraron datos con los criterios de búsqueda");
                        }
                    }
                    that._bIsFirstSearch = false;
                })
                .catch(function (error) {
                    sap.m.MessageToast.show("Ocurrió un error al consultar la información o no se encontraron datos con los criterios de búsqueda");
                });
        },
        */
        onSearchFixedAssets: function () {
            var oView = this.getView();
            var aFilters = [];

            // === Filtros MultiInput generales (excepto CreadoPor) ===
            var oCampos = [
                { inputId: "multiInputDocumentoMaterial", odata: "ASEG.MBLRN" },
                { inputId: "multiInputMaterial", odata: "MARA.NAME" },
                { inputId: "multiInputTipoProgramacion", odata: "ASEG.PROGN" }
            ];

            // === Filtros por fechas ===
            var drsFechaContabilizacion = oView.byId("dateRangeContabilizacion");
            if (drsFechaContabilizacion) {
                var dFrom = drsFechaContabilizacion.getDateValue();
                var dTo = drsFechaContabilizacion.getSecondDateValue();
                if (dFrom && dTo) {
                    var sFrom = dFrom.toISOString().slice(0, 10);
                    var sTo = dTo.toISOString().slice(0, 10);
                    aFilters.push("(AKPF.BUDAT BETWEEN DATE '" + sFrom + "' AND DATE '" + sTo + "')");
                } else if (dFrom) {
                    var sFrom = dFrom.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sFrom + "'");
                } else if (dTo) {
                    var sTo = dTo.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sTo + "'");
                }
            }

            // Fecha de creación
            var drsFechaCreacion = oView.byId("datePickerFechaCreacion");
            if (drsFechaCreacion) {
                var dFromC = drsFechaCreacion.getDateValue();
                var dToC = drsFechaCreacion.getSecondDateValue && drsFechaCreacion.getSecondDateValue();
                if (dFromC && dToC) {
                    var sFromC = dFromC.toISOString().slice(0, 10);
                    var sToC = dToC.toISOString().slice(0, 10);
                    aFilters.push("(AKPF.BUDAT BETWEEN DATE '" + sFromC + "' AND DATE '" + sToC + "')");
                } else if (dFromC) {
                    var sFromC = dFromC.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sFromC + "'");
                } else if (dToC) {
                    var sToC = dToC.toISOString().slice(0, 10);
                    aFilters.push("AKPF.BUDAT EQ '" + sToC + "'");
                }
            }

            // === Filtro especial para multiInputCreadoPor con nombre y apellido ===
            var oMultiModel = oView.getModel("multiSelect");
            var aCreadoPor = oMultiModel.getProperty("/multiInputCreadoPor") || [];
            if (Array.isArray(aCreadoPor) && aCreadoPor.length > 0) {
                var aAndFilters = aCreadoPor.map(function (fullName) {
                    var partes = fullName.trim().split(" ");
                    var nombre = partes[0];
                    var apellido = partes.slice(1).join(" ");
                    nombre = String(nombre).replace(/'/g, "''");
                    apellido = String(apellido).replace(/'/g, "''");
                    return "(TUSR1.NAME EQ '" + nombre + "' AND TUSR1.LNAME EQ '" + apellido + "')";
                });
                aFilters.push(aAndFilters.join(' or '));
            }

            // === Filtros MultiInput ===
            oCampos.forEach(function (campo) {
                var filtro = this.getODataFilter(oView, campo.inputId, campo.odata);
                if (filtro) aFilters.push(filtro);
            }, this);

            // === Construcción final del filtro OData ===
            var sFilter = aFilters.length ? "$filter=" + aFilters.join(' and ') : "";
            var sUrl = this._sFixedAssetsReportServiceUrl + (sFilter ? "?" + sFilter : "");

            var that = this;
            fetch(sUrl)
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    // === CONVERSIÓN DE CAMPOS A STRING ===
                    var stringFields = [
                        "POSTING_DATE",
                        "MBLRN",
                        "LINE_ID",
                        "CONT",
                        "MJAHR",
                        "SUPPLIER_NAME",
                        "CONTRACT_NAME",
                        "PROGN",
                        "PROGP",
                        "PROJECT_ID",
                        "PROJECT_NAME",
                        "MATNR",
                        "MATERIAL_NAME",
                        "ERFMG",
                        "ERFME",
                        "UNIT_PRICE",
                        "CURRENCY_CODE",
                        "CATEGORY_DESC",
                        "FAMILY_DESC",
                        "MAT_BRAND",
                        "MAT_MODEL",
                        "MAT_DIMENSIONS",
                        "MAT_STANDARD",
                        "MAT_FIXED_ASSET",
                        "MAT_PATRIMONIO",
                        "MAT_SPECIAL",
                        "REQ_FFE",
                        "REQ_DIVISION_DESC",
                        "REQ_AREA_DESC",
                        "REQ_UBICA",
                        "REQ_SUBUBICA",
                        "REQ_SUMIN_DESC",
                        "REQ_VISTA_DESC",
                        "SYNCRO_DESC",
                        "FIXEDASSET",
                        "SERIE",
                        "CREATION_NAME",
                        "CREATION_LNAME",
                        "CREATION_EMAIL",
                        "MODIFY_NAME",
                        "MODIFY_LNAME",
                        "MODIFY_EMAIL",
                        "MODIFIED_AT"
                    ];

                    (data.result || []).forEach(function (item) {
                        stringFields.forEach(function (field) {
                            if (item[field] !== undefined && item[field] !== null) {
                                item[field] = String(item[field]);
                            } else {
                                item[field] = "";
                            }
                        });
                    });

                    var oDataResult = { items: data.result };
                    var oModel = new sap.ui.model.json.JSONModel(oDataResult);
                    that.getView().byId("tablaReporteRecActivosFijos").setModel(oModel);

                    // Si necesitas el cálculo de totales, descomenta y ajusta el bloque siguiente
                    /*
                    var nGrandTotal = 0;
                    (data.result || []).forEach(function (item) {
                        var val = parseFloat(item.TOTAL);
                        if (!isNaN(val)) nGrandTotal += val;
                    });
                    var oTotalsModel = new sap.ui.model.json.JSONModel({ grandTotal: nGrandTotal.toFixed(2) });
                    that.getView().setModel(oTotalsModel, "totals");
                    */

                    if (oDataResult.items.length > 0) {
                        if (!that._bIsFirstSearch) {
                            sap.m.MessageToast.show("Información encontrada con los criterios de búsqueda");
                        }
                    } else {
                        if (!that._bIsFirstSearch) {
                            sap.m.MessageToast.show("No se encontraron datos con los criterios de búsqueda");
                        }
                    }
                    that._bIsFirstSearch = false;
                })
                .catch(function (error) {
                    sap.m.MessageToast.show("Ocurrió un error al consultar la información o no se encontraron datos con los criterios de búsqueda");
                });
        },

        /**
         * Maneja el evento de solicitud de ayuda de valor (Value Help Request) para los MultiInput.
         * Abre un SelectDialog para que el usuario seleccione una o más opciones.
         * @param {sap.ui.base.Event} oEvent - El evento disparado.
         */
        /*
        onValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            var sInputId = oInput.getId().split("--").pop();
            var oView = this.getView();
            var oMultiModel = oView.getModel("multiSelect");

            // Tokens actualmente seleccionados (valores KEY)
            var aCurrentSelectedKeys = oMultiModel.getProperty("/" + sInputId) || [];

            // Mapeo de IDs de MultiInput a campos de datos
            var mFieldMap = {
                "multiInputDocumentoMaterial": "MBLRN",
                "multiInputMaterial": "MATERIAL_NAME",
                "multiInputTipoProgramacion": "PROGN",
                "multiInputCreadoPor": "CREATION_NAME"
            };

            // Recopila los valores actuales de los otros MultiInput para filtrar el Value Help
            var oCurrentFilters = {};
            Object.keys(mFieldMap).forEach(function (inputId) {
                if (inputId !== sInputId) {
                    var multiVal = oMultiModel && oMultiModel.getProperty("/" + inputId);
                    if (Array.isArray(multiVal) && multiVal.length > 0) {
                        oCurrentFilters[mFieldMap[inputId]] = multiVal;
                    }
                }
            });

            // Obtiene las opciones del Value Help desde el Component
            var oComponent = sap.ui.component(sap.ui.core.Component.getOwnerIdFor(this.getView()));
            var aOptions = oComponent.getOptions(sInputId, oCurrentFilters);

            // Filtra opciones vacías
            aOptions = aOptions.filter(function (opt) {
                return opt && opt.text && opt.text.trim() !== "";
            });

            // Define el template dinámico
            var oTemplate = new sap.m.StandardListItem({
                title: "{text}",
                description: sInputId === "multiInputCreadoPor" ? "{text}" : "{key}",
                selected: {
                    path: "key",
                    formatter: function (sKey) {
                        return aCurrentSelectedKeys.includes(sKey);
                    }
                }
            });

            // Crea y abre el SelectDialog
            var oDialog = new sap.m.SelectDialog({
                title: "Selecciona una o más opciones",
                items: {
                    path: "/options",
                    template: oTemplate
                },
                multiSelect: true,
                confirm: function (oConfirmEvent) {
                    var aSelectedItems = oConfirmEvent.getParameter("selectedItems") || [];
                    var aSelectedKeys = aSelectedItems.map(function (item) { return item.getDescription() || item.getTitle(); });
                    var aSelectedTexts = aSelectedItems.map(function (item) { return item.getTitle(); });
                    // Actualiza el modelo multiSelect SOLO con los keys
                    oMultiModel.setProperty("/" + sInputId, aSelectedKeys);

                    // Actualiza los tokens visualmente (para mostrar nombre y apellido)
                    var oMultiInput = oView.byId(sInputId);
                    if (oMultiInput) {
                        oMultiInput.removeAllTokens();
                        aSelectedItems.forEach(function (item) {
                            var key = item.getDescription() || item.getTitle();
                            var text = item.getTitle();
                            oMultiInput.addToken(new sap.m.Token({ key: key, text: text }));
                        });
                    }
                },
                liveChange: function (oEvent) {
                    var sValue = oEvent.getParameter("value");
                    var oFilter = new sap.ui.model.Filter({
                        path: "text",
                        operator: sap.ui.model.FilterOperator.Contains,
                        value1: sValue
                    });
                    oEvent.getSource().getBinding("items").filter([oFilter]);
                }
            });

            var oDialogModel = new sap.ui.model.json.JSONModel({ options: aOptions });
            oDialog.setModel(oDialogModel);
            oDialog.open();
        },
        */
        onValueHelpRequest: function (oEvent) {
            var oInput = oEvent.getSource();
            var sInputId = oInput.getId().split("--").pop();
            var oView = this.getView();
            var oMultiModel = oView.getModel("multiSelect");
            var aCurrentSelectedKeys = oMultiModel.getProperty("/" + sInputId) || [];

            var mFieldMap = {
                "multiInputDocumentoMaterial": "MBLRN",
                "multiInputMaterial": "MATERIAL_NAME",
                "multiInputTipoProgramacion": "PROGN",
                "multiInputCreadoPor": "CREATION_NAME"
            };
            var oCurrentFilters = {};
            Object.keys(mFieldMap).forEach(function (inputId) {
                if (inputId !== sInputId) {
                    var multiVal = oMultiModel && oMultiModel.getProperty("/" + inputId);
                    if (Array.isArray(multiVal) && multiVal.length > 0) {
                        oCurrentFilters[mFieldMap[inputId]] = multiVal;
                    }
                }
            });

            var oComponent = sap.ui.component(sap.ui.core.Component.getOwnerIdFor(this.getView()));
            var aOptions = oComponent.getOptions(sInputId, oCurrentFilters);
            aOptions = aOptions.filter(function (opt) {
                return opt && opt.text && opt.text.trim() !== "";
            });

            var oTemplate = new sap.m.StandardListItem({
                title: "{text}",
                description: sInputId === "multiInputCreadoPor" ? "{text}" : "{key}"

                // Revisar para el campo Número de material y Programación
                /*
                selected: {
                    path: "key",
                    formatter: function (sKey) {
                        return aCurrentSelectedKeys.includes(sKey);
                    }
                }
                */
            });

            var oDialog = new sap.m.SelectDialog({
                title: "Selecciona una o más opciones",
                items: { path: "/options", template: oTemplate },
                multiSelect: true,
                confirm: function (oConfirmEvent) {
                    var aSelectedItems = oConfirmEvent.getParameter("selectedItems") || [];
                    var aSelectedKeys = aSelectedItems.map(function (item) { return item.getDescription() || item.getTitle(); });
                    oMultiModel.setProperty("/" + sInputId, aSelectedKeys);
                    // ¡No agregues tokens manualmente!
                },
                liveChange: function (oEvent) {
                    var sValue = oEvent.getParameter("value");
                    var oFilter = new sap.ui.model.Filter({
                        path: "text",
                        operator: sap.ui.model.FilterOperator.Contains,
                        value1: sValue
                    });
                    oEvent.getSource().getBinding("items").filter([oFilter]);
                }
            });

            var oDialogModel = new sap.ui.model.json.JSONModel({ options: aOptions });
            oDialog.setModel(oDialogModel);
            oDialog.open();
        },


        /**
         * Maneja el evento `tokenUpdate` de los controles `sap.m.MultiInput`.
         * Se asegura de que el modelo `multiSelect` esté siempre sincronizado con los tokens del control.
         * Se utiliza un `setTimeout` para mitigar problemas de sincronización en el ciclo de vida del UI5,
         * especialmente al borrar tokens manualmente.
         * @param {sap.ui.base.Event} oEvent - El evento disparado por el MultiInput.
         */
        /**
         * Maneja el evento `tokenUpdate` de los controles `sap.m.MultiInput`.
         * Se asegura de que el modelo `multiSelect` esté siempre sincronizado con los tokens del control.
         * Se utiliza un `setTimeout` para mitigar problemas de sincronización en el ciclo de vida del UI5,
         * especialmente al borrar tokens manualmente.
         * @param {sap.ui.base.Event} oEvent - El evento disparado por el MultiInput.
         */
        onTokenUpdate: function (oEvent) {
            var oMultiInput = oEvent.getSource();
            var sInputId = oMultiInput.getId().split("--").pop(); // Obtiene el ID del input (ej., inputNombreProyecto)
            var oMultiModel = this.getView().getModel("multiSelect");

            // Aplica un pequeño retraso para asegurar que el estado interno del MultiInput
            // se haya actualizado completamente antes de leer sus tokens.
            // Esto es crucial para manejar correctamente las eliminaciones manuales.
            setTimeout(() => {
                let aCurrentMultiInputTokens = oMultiInput.getTokens(); // Obtiene los tokens actuales del control
                let aNewSelectedTexts = [];

                // Verifica que los tokens obtenidos sean un array válido
                if (Array.isArray(aCurrentMultiInputTokens)) {
                    aNewSelectedTexts = aCurrentMultiInputTokens.map(function (oToken) {
                        // Extrae el 'key' o 'text' de cada token
                        return oToken && (oToken.getKey ? oToken.getKey() : oToken.getText());
                    }).filter(Boolean); // Elimina cualquier valor nulo/indefinido que pueda surgir
                } else {
                    // Si getTokens() no devuelve un array, esto es un error crítico inesperado del control
                    sap.m.MessageToast.show("Error interno: No se pudieron leer los tokens del MultiInput. Contacte a soporte.");
                    return;
                }

                // Actualiza la propiedad correspondiente en el modelo 'multiSelect'
                oMultiModel.setProperty("/" + sInputId, aNewSelectedTexts);

                // Si no quedan tokens, limpia el valor de texto del MultiInput para evitar "texto fantasma"
                if (aNewSelectedTexts.length === 0) {
                    oMultiInput.setValue("");
                }

                // Llama a onFilterChange para manejar cualquier lógica de filtros en cascada
                this.onFilterChange({ getSource: () => oMultiInput });

            }, 50); // Retraso de 50 milisegundos
        },

        /**
         * Maneja los cambios en los campos de filtro.
         * Limpia los campos de filtro descendientes cuando un campo superior cambia.
         * @param {sap.ui.base.Event} oEvent - El evento disparado.
         */
        onFilterChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sInputId = oInput.getId().split("--").pop();
            var oView = this.getView();
            var oMultiModel = oView.getModel("multiSelect");
            var oMultiData = oMultiModel.getData();

            var aFilterOrder = [
                "multiInputDocumentoMaterial",
                "multiInputMaterial",
                "multiInputTipoProgramacion",
                "multiInputCreadoPor"
            ];

            var iChangedIndex = aFilterOrder.indexOf(sInputId);

            // --- Solo limpia descendientes si el input quedó vacío ---
            var bIsEmpty = false;

            if (oInput.isA && oInput.isA("sap.m.MultiInput")) {
                // Si es MultiInput, verifica si no quedan tokens seleccionados
                bIsEmpty = (oMultiModel.getProperty("/" + sInputId).length === 0);
            } else {
                // Si es otro tipo de input, verifica el value
                bIsEmpty = (!oInput.getValue || oInput.getValue() === "");
            }

            if (bIsEmpty) {
                // Solo si el input quedó vacío, limpia los descendientes
                for (var i = iChangedIndex + 1; i < aFilterOrder.length; i++) {
                    var sDescendantInputId = aFilterOrder[i];
                    var oDescendantInput = oView.byId(sDescendantInputId);
                    if (oDescendantInput) {
                        if (oDescendantInput.setValue) {
                            oDescendantInput.setValue("");
                        }
                        if (oDescendantInput.isA && oDescendantInput.isA("sap.m.MultiInput")) {
                            oDescendantInput.removeAllTokens();
                        }
                    }
                    oMultiData[sDescendantInputId] = [];
                }
                oMultiModel.setData(oMultiData);
            }
        },

        /**
         * Abre un diálogo para que el usuario adapte la visibilidad de los filtros.
         */
        onChangeFilters: function () {
            var oView = this.getView();
            var oVisibilityModel = oView.getModel("visibility");
            var oData = oVisibilityModel.getData();

            // Prepara los ítems para el diálogo de adaptación de filtros
            var aDialogItems = this.aAllFilters.map(function (item) {
                // Elimina el prefijo 'vbox' y pone la primera letra en minúscula
                var sKey = item.vbox.replace(/^vbox/, "");
                sKey = sKey.charAt(0).toLowerCase() + sKey.slice(1);
                return {
                    vbox: item.vbox,
                    key: sKey,
                    label: item.label,
                    selected: oData[sKey] // Estado actual de visibilidad
                };
            });

            var oDialogModel = new sap.ui.model.json.JSONModel({ filters: aDialogItems });

            if (this._oAdaptDialog) this._oAdaptDialog.destroy();

            this._oAdaptDialog = new sap.m.Dialog({
                title: "Adaptar filtros",
                content: [
                    new sap.m.List({
                        items: {
                            path: "/filters",
                            template: new sap.m.CustomListItem({
                                content: [
                                    new sap.m.HBox({
                                        items: [
                                            new sap.m.CheckBox({ selected: "{selected}" }),
                                            new sap.m.Text({ text: "{label}" })
                                        ]
                                    })
                                ]
                            })
                        }
                    })
                ],
                beginButton: new sap.m.Button({
                    text: "Aceptar",
                    press: function () {
                        var aFilters = oDialogModel.getProperty("/filters");
                        var oNewVis = {};
                        aFilters.forEach(function (item) {
                            oNewVis[item.key] = item.selected;
                        });
                        oVisibilityModel.setData(oNewVis);
                        this._oAdaptDialog.close();
                    }.bind(this)
                }),
                endButton: new sap.m.Button({
                    text: "Cancelar",
                    press: function () { this._oAdaptDialog.close(); }.bind(this)
                })
            });

            this._oAdaptDialog.setModel(oDialogModel);
            oView.addDependent(this._oAdaptDialog);
            this._oAdaptDialog.open();
        },

        /**
         * Maneja el evento de sugerencia de los MultiInput.
         * Proporciona sugerencias de autocompletado basadas en los datos disponibles
         * y los filtros actuales.
         * @param {sap.ui.base.Event} oEvent - El evento disparado.
         */
        onSuggestFilters: function (oEvent) {
            var oInput = oEvent.getSource();
            var sInputId = oInput.getId().split("--").pop(); // Ej: multiInputProyecto
            var sTerm = oEvent.getParameter("suggestValue") || "";
            var oComponent = sap.ui.component(sap.ui.core.Component.getOwnerIdFor(this.getView()));

            var oView = this.getView();
            var oMultiModel = oView.getModel("multiSelect");

            // Mapeo actualizado de IDs de input a campos de datos
            var mFieldMap = {
                "multiInputDocumentoMaterial": "MBLRN",
                "multiInputMaterial": "MATERIAL_NAME",
                "multiInputTipoProgramacion": "PROGN",
                "multiInputCreadoPor": "CREATION_NAME"
            };

            // Recopila los filtros actuales de otros campos para enviar a 'getOptions'
            var oCurrentFilters = {};
            Object.keys(mFieldMap).forEach(function (inputId) {
                if (inputId !== sInputId) {
                    var multiVal = oMultiModel && oMultiModel.getProperty("/" + inputId);
                    if (Array.isArray(multiVal) && multiVal.length > 0) {
                        oCurrentFilters[mFieldMap[inputId]] = multiVal;
                    }
                }
            });

            // Obtiene todas las opciones posibles para la sugerencia aplicando filtros existentes
            var aOptions = oComponent.getOptions(sInputId, oCurrentFilters);

            // Filtra opciones vacías
            aOptions = aOptions.filter(function (opt) {
                return opt && opt.text && opt.text.trim() !== "";
            });

            // Aplica el término de sugerencia del usuario
            var aSuggestions = aOptions.filter(function (opt) {
                return !sTerm || (opt.text && opt.text.toLowerCase().includes(sTerm.toLowerCase()));
            });

            // Crea un modelo JSON con las sugerencias y lo asigna al Input
            var oModel = new sap.ui.model.json.JSONModel(aSuggestions);
            oInput.setModel(oModel);
            oInput.bindAggregation("suggestionItems", {
                path: "/",
                template: new sap.ui.core.Item({ key: "{key}", text: "{text}" })
            });
        },

        /**
         * Abre un diálogo para que el usuario adapte la visibilidad de las columnas de la tabla.
         */
        onSettingsPress: function () {
            var oView = this.getView();
            var oColVisModel = oView.getModel("columnVisibility");
            var oData = oColVisModel.getData();

            // Prepara los ítems para el diálogo de adaptación de columnas
            var aDialogItems = this.aAllColumns.map(function (col) {
                return {
                    id: col.id,
                    label: col.label,
                    selected: oData[col.id] // Estado actual de visibilidad de la columna
                };
            });

            var oDialogModel = new sap.ui.model.json.JSONModel({ columns: aDialogItems });

            // Destruye el diálogo existente si lo hay
            if (this._oColDialog) this._oColDialog.destroy();

            // Crea el nuevo diálogo de adaptación de columnas
            this._oColDialog = new sap.m.Dialog({
                title: "Adaptar columnas",
                content: [
                    new sap.m.List({
                        items: {
                            path: "/columns",
                            template: new sap.m.CustomListItem({
                                content: [
                                    new sap.m.HBox({
                                        items: [
                                            new sap.m.CheckBox({ selected: "{selected}" }),
                                            new sap.m.Text({ text: "{label}" })
                                        ]
                                    })
                                ]
                            })
                        }
                    })
                ],
                // Botón de aceptar para aplicar los cambios de visibilidad de columnas
                beginButton: new sap.m.Button({
                    text: "Aceptar",
                    press: function () {
                        var aCols = oDialogModel.getProperty("/columns");
                        var oNewVis = {};
                        aCols.forEach(function (col) {
                            oNewVis[col.id] = col.selected;
                        });
                        oColVisModel.setData(oNewVis);
                        this._oColDialog.close();
                    }.bind(this)
                }),
                // Botón de cancelar para cerrar sin aplicar cambios
                endButton: new sap.m.Button({
                    text: "Cancelar",
                    press: function () { this._oColDialog.close(); }.bind(this)
                })
            });

            this._oColDialog.setModel(oDialogModel);
            oView.addDependent(this._oColDialog);
            this._oColDialog.open();
        },

        /**
         * Exporta los datos de la tabla actual a un archivo Excel (.xlsx).
         */
        onDownloadExcel: function () {
            var oTable = this.byId("tablaReporteRecActivosFijos");
            var oModel = oTable.getModel();
            var aData = oModel.getProperty("/items"); // Obtiene los datos de la tabla

            // Define las columnas para el archivo Excel, mapeando etiquetas a propiedades de los datos
            var aCols = [
                { label: "Fecha de contabilización", property: "POSTING_DATE" },
                { label: "Documento material", property: "MBLRN" },
                { label: "Posición documento", property: "LINE_ID" },
                { label: "Contador", property: "CONT" },
                { label: "Ejercicio documento", property: "MJAHR" },
                { label: "Proveedor", property: "SUPPLIER_NAME" },
                { label: "Contrato", property: "CONTRACT_NAME" },
                { label: "No. Programación", property: "PROGN" },
                { label: "Posición Programación", property: "PROGP" },
                { label: "ID Proyecto", property: "PROJECT_ID" },
                { label: "Proyecto", property: "PROJECT_NAME" },
                { label: "Material", property: "MATNR" },
                { label: "Nombre", property: "MATERIAL_NAME" },
                { label: "Cantidad", property: "ERFMG" },
                { label: "Unidad de Medida", property: "ERFME" },
                { label: "Precio Unitario", property: "UNIT_PRICE" },
                { label: "Moneda", property: "CURRENCY_CODE" },
                { label: "Categoría", property: "CATEGORY_DESC" },
                { label: "Familia", property: "FAMILY_DESC" },
                { label: "Marca", property: "BRAND_DESC" },
                { label: "Modelo", property: "MODEL_DESC" },
                { label: "Dimensiones", property: "MAT_DIMENSIONS" },
                { label: "Ind. Estándar", property: "MAT_STANDARD" },
                { label: "Ind. Activo Fijo", property: "MAT_FIXED_ASSET" },
                { label: "Patrimonio", property: "MAT_PATRIMONIO" },
                { label: "Especial", property: "MAT_SPECIAL" },
                { label: "FFE", property: "REQ_FFE" },
                { label: "División", property: "REQ_DIVISION_DESC" },
                { label: "Área", property: "REQ_AREA_DESC" },
                { label: "Ubicación", property: "REQ_UBICA" },
                { label: "Sububicación", property: "REQ_SUBUBICA" },
                { label: "Suministrador", property: "REQ_SUMIN" },
                { label: "Vista", property: "REQ_VISTA" },
                { label: "Estatus Sincronización", property: "ESTATUS_SINCRO" },
                { label: "Activo Fijo", property: "FIXEDASSET" },
                { label: "No. Serie", property: "SERIE" },
                { label: "Creado por", property: "CREATION_NAME" },
                { label: "Modificado por", property: "MODIFY_NAME" },
                { label: "Modificado el", property: "MODIFIED_AT" }
            ];

            // Crea y construye el objeto Spreadsheet para la exportación
            var oSheet = new sap.ui.export.Spreadsheet({
                workbook: {
                    columns: aCols
                },
                dataSource: aData,
                fileName: "ReporteRecepcionActivosFijos.xlsx"
            });

            // Construye el archivo y lo descarga, luego destruye el objeto Spreadsheet
            oSheet.build().then(function () {
                oSheet.destroy();
            });
        },
        /*
        // Cuando se sabe si la imagen es jpeg o png
        onPressGeneratePDF: async function () {
            let pdfUrl = null; // Declarar pdfUrl fuera del try para que sea accesible en afterClose y en la función de descarga

            try {
                // 1. Obtener el PDF de tu servicio Node.js
                const response = await fetch("https://web-service-pdfgen-nodejs.cfapps.us10-001.hana.ondemand.com/generar-pdf-desde-imagen", { // Ajusta la URL de tu servicio Node.js
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ base64Image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==" }) // Envía tu imagen base64
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const pdfBlob = await response.blob();
                pdfUrl = URL.createObjectURL(pdfBlob); // Asignar a la variable declarada

                // 2. Crear el contenido HTML con el iframe
                const htmlContent = `<iframe src="${pdfUrl}" width="100%" height="100%" style="border: none;"></iframe>`;

                // 3. Crear y abrir el Dialog con sap.ui.core.HTML
                if (!this._pdfViewerDialog) {
                    this._pdfViewerDialog = new sap.m.Dialog({
                        title: "Visualizador de PDF",
                        contentWidth: "50%",
                        content: new sap.ui.core.HTML({
                            content: htmlContent,
                            preferDOM: true, // Asegura que el iframe se renderice correctamente
                            style: "width: 100%; height: 100%; display: block;" // Para que ocupe toda la altura
                        }),
                        buttons: [
                            // Botón para Descargar PDF
                            new sap.m.Button({
                                text: "Descargar PDF",
                                icon: "sap-icon://download", // Icono de descarga
                                press: function () {
                                    // Crear un enlace temporal para la descarga
                                    const a = document.createElement('a');
                                    a.href = pdfUrl;
                                    a.download = 'documento_generado.pdf'; // Nombre del archivo a descargar
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a); // Limpiar el enlace
                                }
                            }),
                            // Botón para Cerrar Diálogo
                            new sap.m.Button({
                                text: "Cerrar",
                                press: function () {
                                    this._pdfViewerDialog.close();
                                }.bind(this)
                            })
                        ],
                        // El afterClose es crucial para liberar la URL del objeto
                        afterClose: function () {
                            if (pdfUrl) {
                                URL.revokeObjectURL(pdfUrl);
                                pdfUrl = null; // Limpiar la variable
                            }
                        }
                    });
                    this.getView().addDependent(this._pdfViewerDialog);
                } else {
                    // Si el diálogo ya existe, actualizar el contenido del HTML
                    const oldContent = this._pdfViewerDialog.getContent()[0].getContent();
                    const oldUrlMatch = oldContent.match(/src="(blob:.*?)"/);
                    if (oldUrlMatch && oldUrlMatch[1]) {
                        URL.revokeObjectURL(oldUrlMatch[1]);
                    }

                    this._pdfViewerDialog.getContent()[0].setContent(htmlContent);
                    // No necesitamos ajustar el afterClose aquí si el diálogo se reutiliza,
                    // ya que la nueva pdfUrl se gestionará cuando se cierre el diálogo actual.
                    // Si la gestión de _pdfViewerDialog se vuelve compleja con reutilización,
                    // considera recrear el diálogo o resetearlo completamente.
                }

                this._pdfViewerDialog.open();

            } catch (error) {
                console.error("Error al cargar o mostrar el PDF:", error);
                sap.m.MessageToast.show("No se pudo cargar el PDF.");
                if (pdfUrl) { // Asegurarse de liberar la URL si hubo un error antes de abrir el diálogo
                    URL.revokeObjectURL(pdfUrl);
                }
            }
        },
        */

        onGetMatDocData: async function (oEvent) {
            var oLink = oEvent.getSource();
            var oContext = oLink.getBindingContext();
            var oRowData = oContext.getObject();
            var sMBLRN = oRowData.MBLRN;

            var sUrl = this._sSignsPdfServiceUrl + "/" + sMBLRN;

            var that = this;
            fetch(sUrl)
                .then(function (response) {
                    if (!response.ok) { // <-- Aquí validas el status (200-299 es ok)
                        throw new Error("HTTP error, status = " + response.status);
                    }
                    return response.json();
                })
                .then(function (data) {
                    that.onPressGeneratePDF(data);
                })
                .catch(function (error) {
                    sap.m.MessageToast.show("No se encontraron datos");
                });
        },

        onPressGeneratePDF: async function (imagesArr) {

            let pdfUrl = null;

            try {
                // *** DATOS DE LAS IMÁGENES Y SUS TEXTOS ***
                // Aquí debes reemplazar las cadenas Base64 y los textos según tus necesidades.
                // Asegúrate de que las cadenas Base64 sean PURAS (sin "data:image/png;base64,").
                const imagesData = [
                    {
                        base64: "",
                        text: "Dirección de Pre-Aperturas"
                    },
                    {
                        base64: "",
                        text: "Gerencia Operaciones" // Puedes usar \n para saltos de línea
                    },
                    {
                        base64: "",
                        text: "Activos Fijos Hotel"
                    },
                    {
                        base64: "",
                        text: "Gerencia de Equipamiento Xdifica"
                    },
                    {
                        base64: "",
                        text: "Coordinación de Equipamiento Xdifica"
                    }
                    // Agrega más objetos según la cantidad de imágenes que necesites
                ];

                // Rellenar imagesData con los datos recibidos (máx 5)
                if (imagesArr.images && Array.isArray(imagesArr.images)) {
                    for (let i = 0; i < imagesData.length; i++) {
                        if (imagesArr.images[i] && imagesArr.images[i].data) {
                            imagesData[i].base64 = imagesArr.images[i].data;
                        } else {
                            imagesData[i].base64 = ""; // o null, según lo que esperes en el backend
                        }
                    }
                }

                // *** OPCIONES DE FORMATO DEL PDF ***
                const pdfConfiguration = {
                    pageSize: 'A4',       // 'A4', 'Letter', etc. o [width, height] en puntos.
                    pageOrientation: 'portrait', // 'portrait' o 'landscape'
                    imageScale: 0.7,      // Escala general de las imágenes. Ajusta si las imágenes son muy grandes/pequeñas.
                    padding: 50,          // Margen general de la página.
                    imageTextSpacing: 10, // Espacio en puntos entre la imagen y su texto
                    grid: {
                        columns: 2,       // Número de columnas por página (como tu ejemplo)
                        rowsPerPage: 3    // Número de filas de imágenes por página
                    },
                    fontFamily: 'Helvetica', // La fuente debe ser una de StandardFonts de pdf-lib
                    fontSize: 10,
                    textColor: { r: 0, g: 0, b: 0 } // RGB para el color del texto (negro)
                };

                // 1. Obtener el PDF de tu servicio Node.js
                const response = await fetch("https://web-service-pdfgen-nodejs.cfapps.us10-001.hana.ondemand.com/generar-pdf-desde-imagen", { // Ajusta la URL
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json", // Vuelve a JSON
                        // Si todas tus imágenes son del mismo formato, puedes enviar un X-Image-Format general.
                        // Si no, la detección en el backend con sharp es la mejor opción.
                        // "X-Image-Format": "octet-stream" // O "png", "jpeg"
                    },
                    body: JSON.stringify({
                        images: imagesData,  // Envía el array de imágenes
                        pdfOptions: pdfConfiguration
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
                }

                const pdfBlob = await response.blob();
                pdfUrl = URL.createObjectURL(pdfBlob);

                // 2. Crear el contenido HTML con el iframe
                const htmlContent = `<iframe src="${pdfUrl}"></iframe>`;

                // 3. Crear y abrir el Dialog con sap.ui.core.HTML (el código existente es bueno)
                if (!this._pdfViewerDialog) {
                    this._pdfViewerDialog = new sap.m.Dialog({
                        title: "Visualizador de PDF",
                        contentWidth: "50%",
                        content: new sap.ui.core.HTML({
                            content: htmlContent,
                            preferDOM: true,
                            style: "width: 100%; height: 100%; display: block;"
                        }),
                        buttons: [
                            new sap.m.Button({
                                text: "Descargar PDF",
                                icon: "sap-icon://download",
                                press: function () {
                                    const a = document.createElement('a');
                                    a.href = pdfUrl;
                                    a.download = 'documento_multi_imagen.pdf';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                }
                            }),
                            new sap.m.Button({
                                text: "Cerrar",
                                press: function () {
                                    this._pdfViewerDialog.close();
                                }.bind(this)
                            })
                        ],
                        afterClose: function () {
                            if (pdfUrl) {
                                URL.revokeObjectURL(pdfUrl);
                                pdfUrl = null;
                            }
                        }
                    });
                    this.getView().addDependent(this._pdfViewerDialog);
                } else {
                    const oldContent = this._pdfViewerDialog.getContent()[0].getContent();
                    const oldUrlMatch = oldContent.match(/src="(blob:.*?)"/);
                    if (oldUrlMatch && oldUrlMatch[1]) {
                        URL.revokeObjectURL(oldUrlMatch[1]);
                    }
                    this._pdfViewerDialog.getContent()[0].setContent(htmlContent);
                }

                this._pdfViewerDialog.open();

            } catch (error) {
                console.error("Error al cargar o mostrar el PDF:", error);
                sap.m.MessageToast.show("No se pudo cargar el PDF. Detalle: " + error.message);
                if (pdfUrl) {
                    URL.revokeObjectURL(pdfUrl);
                }
            }

        }

    });
});