﻿
//this is here for compilation in a web worker
interface CanvasRenderingContext2D {
}

// dependency libraries
let PDFDocument: PDFKit.PDFDocument;

/* module system */

var module = this as NodeModule;

module.require = (id: string): any => {

    if (id in module) {
        return module[id];
    }

    return this;
};

importScripts(
    '../../target/js/browser.maker.js?' + new Date().valueOf(),
    '../../external/bezier-js/bezier.js',
    '../iexport.js');

var makerjs: typeof MakerJs = require('makerjs');

var deps: { [format: number]: boolean } = {};

deps[MakerJsPlaygroundExport.ExportFormat.Dxf] = true;
deps[MakerJsPlaygroundExport.ExportFormat.Json] = true;
deps[MakerJsPlaygroundExport.ExportFormat.OpenJsCad] = true;
deps[MakerJsPlaygroundExport.ExportFormat.Svg] = true;
deps[MakerJsPlaygroundExport.ExportFormat.Stl] = false;
deps[MakerJsPlaygroundExport.ExportFormat.Pdf] = false;

interface IExporter {
    (modelToExport: MakerJs.IModel | any, options?: MakerJs.exporter.IExportOptions | any): any;
}

function getExporter(format: MakerJsPlaygroundExport.ExportFormat, result: MakerJsPlaygroundExport.IExportResponse): IExporter {

    var f = MakerJsPlaygroundExport.ExportFormat;

    switch (format) {
        case f.Json:
            return makerjs.exporter.toJson;

        case f.Dxf:
            function toDXF(model: MakerJs.IModel, options: MakerJs.exporter.IDXFRenderOptions) {
                if (!options.units) {
                    options.units = model.units || makerjs.unitType.Millimeter;
                }
                return makerjs.exporter.toDXF(model, options);
            }
            return toDXF;

        case f.Svg:
            return makerjs.exporter.toSVG;

        case f.OpenJsCad:
            return makerjs.exporter.toOpenJsCad;

        case f.Stl:
            function toStl(model: MakerJs.IModel, options: MakerJs.exporter.IJsCadCsgOptions) {

                if (!deps[MakerJsPlaygroundExport.ExportFormat.Stl]) {
                    importScripts(
                        '../../external/jscad/csg.js',
                        '../../external/jscad/stl-serializer.js'
                    );
                    deps[MakerJsPlaygroundExport.ExportFormat.Stl] = true;
                }

                //make sure size is in mm for STL
                model = makerjs.model.convertUnits(model, makerjs.unitType.Millimeter);

                const { CAG }: { CAG: typeof jscad.CAG } = require('@jscad/csg');
                const stlSerializer: jscad.StlSerializer = require('@jscad/stl-serializer');

                function makePhasedCallback(phaseStart: number, phaseSpan: number) {
                    return function statusCallback(status) {
                        result.percentComplete = phaseStart + status.progress * phaseSpan / 100;
                        postMessage(result);
                    }
                }
                options.statusCallback = makePhasedCallback(0, 50);
                const csg = makerjs.exporter.toJsCadCSG(CAG, model, options);

                return stlSerializer.serialize(csg, { binary: false, statusCallback: makePhasedCallback(50, 50) });
            }
            return toStl;

        case f.Pdf:
            function toPdf(model: MakerJs.IModel, exportOptions: MakerJs.exporter.IPDFRenderOptions) {

                if (!deps[MakerJsPlaygroundExport.ExportFormat.Pdf]) {
                    importScripts(
                        '../../external/text-encoding/encoding-indexes.js',
                        '../../external/text-encoding/encoding.js',
                        '../../external/PDFKit/pdfkit.js',
                        'string-reader.js'
                    );
                    deps[MakerJsPlaygroundExport.ExportFormat.Pdf] = true;
                }

                function complete(pdfDataString: string) {
                    result.text = pdfDataString;
                    result.percentComplete = 100;
                    postMessage(result);
                }

                //TODO: watermark
                //TODO: title, author, grid from options
                var pdfOptions: PDFKit.PDFDocumentOptions = {
                    compress: false,
                    info: {
                        Producer: 'MakerJs',
                        Author: 'MakerJs'
                    }
                };
                var doc: PDFKit.PDFDocument = new PDFDocument(pdfOptions);
                var reader = new StringReader(complete);
                var stream = doc.pipe(reader);

                //TODO: break up model across pages

                makerjs.exporter.toPDF(doc, model, exportOptions);

                doc.end();
            }
            return toPdf;
    }
}

/* events */

onmessage = (ev: MessageEvent) => {

    var request = ev.data as MakerJsPlaygroundExport.IExportRequest;

    var result: MakerJsPlaygroundExport.IExportResponse = {
        format: request.format,
        formatTitle: request.formatTitle,
        error: null,
        text: null,
        percentComplete: 0
    };

    var exporter = getExporter(request.format, result);
    if (exporter) {

        //call the exporter function.
        try {
            result.text = exporter(request.model, request.options);
        } catch (e) {
            result.error = '' + e;
        }
        result.percentComplete = 100;
        postMessage(result);

    }

}
