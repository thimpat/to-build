#!/usr/bin/env node

/**
 * @author Patrice Thimothee
 *
 * @example
 *
 * # Generate minified with source maps in the ./out directory
 * $> to-build src/index.html
 *
 * # Generate minified css with source maps in a folder called "target"
 * $> to-build src/index.html --output target
 *
 * # Generate minified css with no source map
 * $> to-build src/index.html --sourcemaps false
 *
 * # Generate non-minified css
 * $> to-build src/index.html --minifyCss false
 *
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const minimist = require("minimist");
const stripHtmlComments = require("strip-html-comments");
const minifierHtml = require("html-minifier").minify;

const {resolvePath, joinPath} = require("@thimpat/libutils");
const {getRoots, setRoots} = require("./root-folders.cjs");

const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-js");

const parseCli = (argv) =>
{
    return minimist(argv.slice(2));
};

const getBooleanOptionValue = (cli, optionName, defaultValue = false) =>
{
    try
    {
        optionName = optionName.toLowerCase();
        if (!cli.hasOwnProperty(optionName))
        {
            return defaultValue;
        }

        let prop = cli[optionName] || "";
        prop = prop.trim().toLowerCase();

        if (!prop)
        {
            return false;
        }

        return !["false", "no", "none"].includes(prop);
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return defaultValue;
};

/**
 *
 */
const getLinks = (content, {tagName = "link", sourceRefName = "href", extraProperty = null} = {}) =>
{
    try
    {
        // const regexp = /href=["']([^"'#]+)/gm;
        const search = `<${tagName}\\b.*${sourceRefName}=["']([^"'#]+).*>`;
        const regexp = new RegExp(search, "gmi");
        const matches = [...content.matchAll(regexp)];
        if (!matches || !matches.length)
        {
            return [];
        }

        const result = [];
        for (const match of matches)
        {
            if (extraProperty)
            {
                if (match[0].toLowerCase().indexOf(extraProperty) === -1)
                {
                    continue;
                }
            }

            result.push(
                {tag: match[0], uri: match[1]});
        }

        return result;
    }
    catch (e)
    {
        console.error({lid: 1013}, e.message);
    }

    return [];
};

/**
 *
 */
const getCss = (content) =>
{
    try
    {
        const res = getLinks(content, {tagName: "link", sourceRefName: "href", extraProperty: "stylesheet"});
        return res || [];
    }
    catch (e)
    {
        console.error({lid: 1011}, e.message);
    }

    return [];
};

const getJs = (content) =>
{
    try
    {
        const res = getLinks(content, {tagName: "script", sourceRefName: "src"});
        return res || [];
    }
    catch (e)
    {
        console.error({lid: 1009}, e.message);
    }

    return [];
};

const lookupSourcePath = (source) =>
{
    try
    {
        const lookupFolders = getRoots();

        for (let i = 0; i < lookupFolders.length; ++i)
        {
            const rootFolder = lookupFolders[i];
            if (!source)
            {
                debugger;
            }
            const sourcePath = joinPath(rootFolder, source);

            if (!sourcePath)
            {
                debugger;
            }

            if (fs.existsSync(sourcePath))
            {
                return sourcePath;
            }
        }
    }
    catch (e)
    {
        console.error({lid: 1001}, e.message);
    }

    return null;
};

const addMinExtension = (uri) =>
{
    try
    {
        const info = path.parse(uri);
        const newBaseName = info.name + ".min" + info.ext;

        const index = uri.lastIndexOf(info.base);
        uri = uri.substring(0, index) + newBaseName + uri.substring(index + info.base.length);

        return uri;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return uri;

};


const replaceLast = (str, search, replace) =>
{
    try
    {
        const index = str.lastIndexOf(search);
        str = str.substring(0, index) + replace + str.substring(index + search.length);
        return str;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return str;
};

const makePathRelative = (newUri) =>
{
    try
    {
        if (path.isAbsolute(newUri))
        {
            newUri = "." + newUri;
        }
        else
        {
            if (!newUri.startsWith("./"))
            {
                newUri = "./" + newUri;
            }
        }

        return newUri;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return newUri;
};

const minifyCssContentWithCleanCss = (source, cssMinifyingOptions) =>
{
    return new Promise((resolve, reject) =>
    {
        try
        {
            const fileContent = fs.readFileSync(source, "utf-8");
            const ttt = new CleanCSS(cssMinifyingOptions).minify(fileContent);

            new CleanCSS(cssMinifyingOptions).minify(fileContent, function (error, output)
            {
                resolve(output);
                // access output.sourceMap for SourceMapGenerator object
                // see https://github.com/mozilla/source-map/#sourcemapgenerator for more details
            });
        }
        catch (e)
        {
            console.error({lid: 1000}, e.message);
            reject(e);
        }

    });
};

const updateHtml = (htmlContent, {uri, tag, minifiedUri, targetBase}) =>
{
    try
    {
        const originalUri = uri;
        uri = makePathRelative(uri);
        uri = replaceLast(uri, targetBase, minifiedUri);

        let newTag = replaceLast(tag, originalUri, uri);
        htmlContent = htmlContent.replace(tag, newTag);
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return htmlContent;
};

const reportResult = ({sourcemaps, minified, uri}) =>
{
    try
    {
        if (sourcemaps)
        {
            console.log(`Minified, source mapped and copied ${uri}`);
        }
        else
        {
            console.log(`Minified and copied ${uri}`);
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

/**
 * Minify css file using cleanCss to do the minifying
 * @param solvedSourceAbsolutePath
 * @param htmlContent
 * @param sourcemaps
 * @param targetDir
 * @param targetName
 * @param targetBase
 * @param uriProp
 * @returns {null|{content: string, htmlContent: *}}
 */
const minifyCss = (solvedSourceAbsolutePath, {
    htmlContent,
    sourcemaps = false,
    targetDir,
    targetName,
    targetBase,
    uriProp
} = {}) =>
{
    try
    {
        const cssMinifyingOptions = {};
        if (sourcemaps)
        {
            cssMinifyingOptions.sourceMap = true;
            cssMinifyingOptions.rebaseTo = targetDir;
        }

        let content = "";

        const originalContent = fs.readFileSync(solvedSourceAbsolutePath, "utf-8");
        const css = new CleanCSS(cssMinifyingOptions).minify(originalContent);

        // css.warnings && css.warnings.length && console.log(css.warnings.join(os.EOL));
        css.errors && css.errors.length && console.log(css.errors.join(os.EOL));

        // CSS minifying was successful
        if (css && css.styles)
        {
            content = css.styles;
        }


        let minifiedUri = targetName + ".min.css";
        const targetPath = joinPath(targetDir, targetName + ".css");
        const targetPathMinified = joinPath(targetDir, minifiedUri);
        if (css.sourceMap)
        {
            const sourcemapPath = joinPath(targetDir, targetName + ".css.map");
            const sourcemapContent = css.sourceMap.toString();

            // Write source map
            fs.writeFileSync(sourcemapPath, sourcemapContent, "utf-8");

            // Write original
            fs.writeFileSync(targetPath, originalContent, "utf-8");

            content = content + os.EOL + `/*# sourceMappingURL=${targetName}.css.map */`;
        }

        // Write minified
        fs.writeFileSync(targetPathMinified, content, "utf-8");

        let {uri, tag} = uriProp;
        htmlContent = updateHtml(htmlContent, {uri, tag, minifiedUri, targetBase});

        reportResult({sourcemaps: !!css.sourceMap, minified: true, uri});

        return {content, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
};

/**
 * Minify .js using uglify-js to do the minifying
 * @param solvedSourceAbsolutePath
 * @param sourcemaps
 * @param targetDir
 * @param targetName
 * @param uri
 * @returns {{content: string}|null}
 */
const minifyJs = (solvedSourceAbsolutePath, {
    htmlContent,
    sourcemaps = false,
    targetDir,
    targetName,
    targetBase,
    uriProp
} = {}) =>
{
    try
    {
        let minifiedUri = targetName + ".min.js";
        const targetPath = joinPath(targetDir, targetName + ".js");
        const targetPathMinified = joinPath(targetDir, minifiedUri);
        const sourcemapPath = joinPath(targetDir, targetName + ".js.map");

        const jsMinifyingOptions = {};
        if (sourcemaps)
        {
            jsMinifyingOptions.sourceMap = {
                filename: targetBase,
                url     : targetName + ".js.map"
            };
        }

        const originalContent = fs.readFileSync(solvedSourceAbsolutePath, "utf-8");
        const result = UglifyJS.minify(originalContent, jsMinifyingOptions);

        if (result.error)
        {
            console.error(result.error);
            return null;
        }

        const content = result.code;

        // Write minified
        fs.writeFileSync(targetPathMinified, content, "utf-8");

        if (result.map)
        {
            const sourcemapContent = result.map;

            // Write source map
            fs.writeFileSync(sourcemapPath, sourcemapContent, "utf-8");

            // Write original
            fs.writeFileSync(targetPath, originalContent, "utf-8");
        }

        let {uri, tag} = uriProp;
        htmlContent = updateHtml(htmlContent, {uri, tag, minifiedUri, targetBase});

        reportResult({sourcemaps: !!sourcemaps, minified: true, uri});

        return {content, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
};

/**
 * Copy an uri to the target folder
 * @param uri
 * @param uriProp
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param type
 * @returns {null|{uri}}
 */
const copyEntity = (uriProp, destFolder, htmlContent, {
    minify = false,
    type = undefined,
    sourcemaps = false
} = {}) =>
{
    try
    {
        let {uri} = uriProp;

        // Look for uri in various folders (root folder defined by user like node_modules)
        let solvedSourceAbsolutePath = lookupSourcePath(uri);
        if (!solvedSourceAbsolutePath)
        {
            console.error(`Could not find ${uri}`);
            return null;
        }

        // Create target folder
        let targetPath = joinPath(destFolder, uri);
        const infoPath = path.parse(targetPath);
        if (!fs.existsSync(infoPath.dir))
        {
            fs.mkdirSync(infoPath.dir, {recursive: true});
        }

        let processedAlready = false;
        let res;

        // Minify
        if (minify)
        {
            if (type === "css")
            {
                res = minifyCss(solvedSourceAbsolutePath, {
                    htmlContent,
                    sourcemaps,
                    targetDir : infoPath.dir,
                    targetName: infoPath.name,
                    targetBase: infoPath.base,
                    uriProp
                });
            }
            else if (type === "js")
            {
                res = minifyJs(solvedSourceAbsolutePath, {
                    htmlContent,
                    sourcemaps,
                    targetDir : infoPath.dir,
                    targetName: infoPath.name,
                    targetBase: infoPath.base,
                    uriProp
                });
            }

            if (res)
            {
                htmlContent = res.htmlContent;
                processedAlready = true;
            }
        }

        if (!processedAlready)
        {
            fs.copyFileSync(solvedSourceAbsolutePath, targetPath);
            console.log(`Copied ${uri}`);
        }

        return {uri, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1003}, e.message);
    }

    return null;
};

/**
 * Copy an array of uris to the target folder
 * @param uris
 * @param htmlContent
 * @param outputFolder
 * @param minifyCss
 * @returns {string}
 */
const copyEntities = (uris, outputFolder, {htmlContent = null, minify = false, sourcemaps = false, type = null} = {}) =>
{
    try
    {
        for (let i = 0; i < uris.length; ++i)
        {
            const uriProp = uris[i];
            const res = copyEntity(uriProp, outputFolder, htmlContent, {minify, sourcemaps, type});

            if (!res)
            {
                console.log(`Failed to copy ${uriProp.uri} to ${outputFolder}`);
                continue;
            }

            htmlContent = res.htmlContent;
        }
    }
    catch (e)
    {
        console.error({lid: 1005}, e.message);
    }

    return htmlContent;
};

/**
 * Extract CSS and Js url from source
 * @param {string} input
 * @param {string} outputFolder
 * @param minifyHtml
 * @param minifyCss
 * @param minifyJs
 * @param sourcemaps
 * @returns {string}
 */
const copyAssetsFromHTML = (input, outputFolder, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false
} = {}) =>
{
    try
    {
        let htmlContent = fs.readFileSync(input, "utf-8");
        htmlContent = stripHtmlComments(htmlContent);

        if (minifyHtml)
        {
            // htmlContent = minifierHtml(htmlContent, {
            //     collapseWhitespace   : true,
            //     continueOnParseError : true,
            //     keepClosingSlash     : true,
            //     removeAttributeQuotes: false,
            //     minifyCss,
            //     minifyJs
            // });
        }

        const cssFiles = getCss(htmlContent);
        htmlContent = copyEntities(cssFiles, outputFolder, {htmlContent, minify: minifyCss, type: "css", sourcemaps});

        const jsFiles = getJs(htmlContent);
        htmlContent = copyEntities(jsFiles, outputFolder, {htmlContent, minify: minifyJs, type: "js", sourcemaps});

        return htmlContent;
    }
    catch (e)
    {
        console.error({lid: 1015}, e.message);
    }

    return null;
};

/**
 *
 * @param outputFolder
 * @param inputs
 * @param minifyHtml
 * @param minifyCss
 * @param minifyJs
 * @param sourcemaps
 * @returns {boolean}
 */
const generateBuildFolder = (outputFolder, inputs, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false
} = {}) =>
{
    try
    {
        fs.mkdirSync(outputFolder, {recursive: true});

        for (let i = 0; i < inputs.length; ++i)
        {
            const htmlPath = inputs[i];

            const parsed = path.parse(htmlPath);

            const realOutputFolder = path.isAbsolute(parsed.dir) ? resolvePath(outputFolder) : joinPath(outputFolder, parsed.dir);
            const htmlContent = copyAssetsFromHTML(htmlPath, realOutputFolder, {
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps
            });

            // copyEntity(htmlPath, outputFolder, {content});
            const targetHtmlPath = joinPath(realOutputFolder, parsed.base);
            fs.writeFileSync(targetHtmlPath, htmlContent, "utf-8");
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 1017}, e.message);
    }

    return false;
};

(async function init()
{

    try
    {
        const cli = parseCli(process.argv);

        for (let key in cli)
        {
            const lowerCaseKey = key.toLowerCase();
            if (lowerCaseKey !== key)
            {
                cli[lowerCaseKey] = cli[key];
            }
        }

        // Grab input HTML files
        const inputs = cli._;

        // Grab output folder
        let outputFolder = cli.output || "./out";
        outputFolder = resolvePath(outputFolder);

        // Define lookup root folders
        setRoots(cli.root);

        const minifyHtml = getBooleanOptionValue(cli, "minifyHtml", true);
        const minifyCss = getBooleanOptionValue(cli, "minifyCss", true);
        const minifyJs = getBooleanOptionValue(cli, "minifyJs", true);
        const sourcemaps = getBooleanOptionValue(cli, "sourcemaps", true);

        // Copy detected files in HTML source to target folder
        generateBuildFolder(outputFolder, inputs, {minifyHtml, minifyCss, minifyJs, sourcemaps});

        return true;
    }
    catch (e)
    {
        console.error({lid: 1021}, e.message);
    }

    return false;

}());