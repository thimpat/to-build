#!/usr/bin/env node

const minimist = require("minimist");
const fs = require("fs");
const stripHtmlComments = require("strip-html-comments");
const {resolvePath, joinPath} = require("@thimpat/libutils");
const {getRoots, setRoots} = require("./root-folders.cjs");
const path = require("path");
const CleanCSS = require("clean-css");
const os = require("os");
const minifierHtml = require("html-minifier").minify;

const parseCli = (argv) =>
{
    return minimist(argv.slice(2));
};


/**
 *
 */
const getLinks = (content, {tagName = "link", sourceRefName = "href", extraProperty = null} = {}) =>
{
    try
    {
        // const regexp = /href=["']([^"'#]+)/gm;
        const search = `<${tagName}\\b.*${sourceRefName}=["']([^"'#]+).*\\\/>`;
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

const minifyCss = (solvedSourceAbsolutePath, {sourcemaps = true, targetDir, targetName} = {}) =>
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

        css.warnings && css.warnings.length && console.log(css.warnings.join(os.EOL));
        css.errors && css.errors.length && console.log(css.errors.join(os.EOL));

        // CSS minifying was successful
        if (css && css.styles)
        {
            content = css.styles;
        }

        let sourceMapOkay;
        if (css.sourceMap)
        {
            const sourcemapPath = joinPath(targetDir, targetName + ".css.map");
            const sourcemapContent = css.sourceMap.toString();

            // Write source map
            fs.writeFileSync(sourcemapPath, sourcemapContent, "utf-8");

            sourceMapOkay = true;
        }

        const targetPath = joinPath(targetDir, targetName + ".css");
        const targetPathMinified = joinPath(targetDir, targetName + ".min.css");
        if (sourceMapOkay)
        {
            content = content + os.EOL + `/*# sourceMappingURL=${targetName}.css.map */`;
        }

        // Write minified
        fs.writeFileSync(targetPathMinified, content, "utf-8");

        // Write original
        fs.writeFileSync(targetPath, originalContent, "utf-8");


        return {content};
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
    sourcemaps = false,
    cssMinifyingOptions = {}
} = {}) =>
{
    try
    {
        let {tag, uri} = uriProp;
        const originalUri = uri;

        let minifiedContent = null;

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

        // Minify
        if (type === "css" && minify)
        {
            const res = minifyCss(solvedSourceAbsolutePath, {sourcemaps, targetDir: infoPath.dir, targetName: infoPath.name});
            if (res)
            {
                console.log(`Minified and copied ${uri}`);
            }
        }
        else
        {
            fs.copyFileSync(solvedSourceAbsolutePath, targetPath);
            console.log(`Copied ${uri}`);
        }

        uri = makePathRelative(uri);

        let newTag = tag.replace(originalUri, uri);
        htmlContent = htmlContent.replace(tag, newTag);

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
 * @returns {boolean}
 */
const copyEntities = (uris, outputFolder, {htmlContent = null, minify = true, sourcemaps = true, type = null} = {}) =>
{
    try
    {
        for (let i = 0; i < uris.length; ++i)
        {
            const uriProp = uris[i];
            const res =  copyEntity(uriProp, outputFolder, htmlContent, {minify, sourcemaps, type});

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
 * @returns {boolean}
 */
const copyAssetsFromHTML = (input, outputFolder, {
    minifyHtml = true,
    minifyCss = true,
    minifyJs = true,
    sourcemaps = true
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

        const csses = getCss(htmlContent);
        htmlContent = copyEntities(csses, outputFolder, {htmlContent, minify: minifyCss, type: "css", sourcemaps});

        // const jses = getJs(htmlContent);
        // htmlContent = copyEntities(jses, htmlContent, outputFolder, {htmlContent: htmlContent, minify: minifyJs,
        // type: "js"});

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
 * @returns {boolean}
 */
const generateBuildFolder = (outputFolder, inputs, {
    minifyHtml = true,
    minifyCss = true,
    minifyJs = true,
    sourcemaps = true
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
            const content = copyAssetsFromHTML(htmlPath, realOutputFolder, {
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps
            });

            // copyEntity(htmlPath, outputFolder, {content});
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

        // Grab input HTML files
        const inputs = cli._;

        // Grab output folder
        let outputFolder = cli.output || "./out";
        outputFolder = resolvePath(outputFolder);

        // Define lookup root folders
        setRoots(cli.root);

        const minifyHtml = cli.hasOwnProperty("minifyHtml") ? cli.minifyHtml : true;
        const minifyCss = cli.hasOwnProperty("minifyCss") ? cli.minifyCss : true;
        const minifyJs = cli.hasOwnProperty("minifyJs") ? cli.minifyJs : true;
        const sourcemaps = cli.hasOwnProperty("sourcemaps") ? cli.minifyJs : true;

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