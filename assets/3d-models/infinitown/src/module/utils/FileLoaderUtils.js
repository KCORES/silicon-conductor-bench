import {FileLoader} from "three";
import {DefaultLoadingManager} from "three";


class FileLoaderUtils extends FileLoader{
    constructor(data){
        super();
        this.manager = undefined !== data ? data : DefaultLoadingManager;
    }
    load(url, loadCallback, onProgress, onError) {
        let sphericalHarmonicsCoefficients = this.sphericalHarmonicsCoefficients;
        super.load(url, function(data) {
            const jsonData = JSON.parse(data);
            const x = sphericalHarmonicsCoefficients(jsonData);
            loadCallback(x);
        }, onProgress, onError);
    }
    /**
     * 处理光的漫反射/环境光,球谐函数系数
     * @param jsonData
     * @returns {number[]}
     */
    sphericalHarmonicsCoefficients(jsonData) {
        // Copy the first 27 SH coefficients used for diffuse IBL.
        var data = jsonData.slice(0, 27);
        // 我猜应该是9个系数
        // 通过预先计算出的常数来优化漫反射
        // 伴随勒让德多项式 常量
        var a = 1 / (2 * Math.sqrt(Math.PI));
        var e = -(.5 * Math.sqrt(3 / Math.PI));
        var i = -e;
        var abcd = e;
        var knobHalf = .5 * Math.sqrt(15 / Math.PI);
        var currentRelations = -knobHalf;
        var c = .25 * Math.sqrt(5 / Math.PI);
        var addedRelations = currentRelations;
        var l = .25 * Math.sqrt(15 / Math.PI);
        var array = [a, a, a, e, e, e, i, i, i, abcd, abcd, abcd, knobHalf, knobHalf, knobHalf, currentRelations, currentRelations, currentRelations, c, c, c, addedRelations, addedRelations, addedRelations, l, l, l];
        return array.map(function(value, index) {
            return value * data[index];
        });
    }
}

export default FileLoaderUtils
