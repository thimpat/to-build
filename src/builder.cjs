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
const {setRoots, getRoots, setStaticDirs, getStaticDirs, getPathName} = require("./source-finder.cjs");

const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-js");

const {TARGET, transpileFiles} = require("to-esm");

const {CATEGORY, addEntity, addProdCode, getEntities, getCodeTagID} = require("./entity-manager.cjs");
const {startGenServer, stopGenServer, isGenserverUp} = require("genserve");
const {getHashFromFile, getHashFromText} = require("./utils.cjs");
const {MASKS} = require("./constants.cjs");

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
        console.error({lid: 1031}, e.message);
    }

    return defaultValue;
};

/**
 * Extract uris from the given source code and create some objects from them
 * @param {string} content Source code to parse
 * @param {string} search String for the regex that will do the search. The regex must contain
 * one subgroup that points to the url to extract to be valid. When search is defined, the internal
 * generated regex is ignored.
 * @param referenceDir
 * @param {string} tagName Tag to extract the uri source from (can be a regex string)
 * @param {string} sourceRefName Property that contains the uri to register
 * @param {string|null} extraProperty When the tag is detected, we can check whether a property is there to narrow down
 * the selection. (can be a regex string)
 * @param {CATEGORY_TYPE} category
 * @returns {*}
 */
const extractEntities = (content, {
    search = "",
    referenceDir = "",
    tagName = "link",
    sourceRefName = "href",
    extraProperty = null,
    category = ""
} = {}) =>
{
    try
    {
        category = category || tagName + "_" + sourceRefName;

        search = search || `<${tagName} .*?\\b${sourceRefName}\\s*=\\s*["']([^"']+)["'].*?>(<\/${tagName}>)?`;
        const regexp = new RegExp(search, "gmi");
        const matches = [...content.matchAll(regexp)];
        if (!matches || !matches.length)
        {
            return content;
        }

        let regexpProp = null;
        if (extraProperty)
        {
            regexpProp = new RegExp(extraProperty, "g");
        }

        for (const match of matches)
        {
            const tag = match[0].toLowerCase();
            if (extraProperty)
            {
                regexpProp = new RegExp(extraProperty, "g");
                if (!(regexpProp.test(tag)))
                {
                    continue;
                }
            }

            const uri = match[1];


            const added = addEntity(category, {tag, uri}, referenceDir);
            if (!added)
            {
                continue;
            }

            content = content.replace(tag, added.replacement);
        }

        return content;
    }
    catch (e)
    {
        console.error({lid: 1013}, e.message);
    }

    return content;
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
        console.error({lid: 1015}, e.message);
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
        console.error({lid: 1017}, e.message);
    }

    return newUri;
};

const decorticatePath = (targetPath) =>
{
    try
    {
        const infoPath = path.parse(targetPath);
        infoPath.filename = getPathName(infoPath.base, {withTrailingSlash: false});
        infoPath.originalPath = targetPath;

        infoPath.path = targetPath;
        if (infoPath.filename !== infoPath.base)
        {
            infoPath.path = joinPath(infoPath.dir, infoPath.filename);
        }
        return infoPath;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

/**
 * Re-insert the modified code
 * @param htmlContent
 * @param entity
 * @param minifiedUri
 * @returns {*}
 */
const updateHtml = (htmlContent, {entity}) =>
{
    try
    {
        entity.uri = makePathRelative(entity.uri);

        let newTag = replaceLast(entity.tag, entity.originalUri, entity.uri);
        htmlContent = htmlContent.replace(entity.replacement, newTag);
    }
    catch (e)
    {
        console.error({lid: 1021}, e.message);
    }

    return htmlContent;
};

const reviewTargetEntity = async (entity, destFolder, {production = false, minify = false, sourcemaps = false} = {}) =>
{
    try
    {
        if (production)
        {
            minify = false;
        }

        let {uri} = entity;

        if (production)
        {
            let newName = await getHashFromFile(entity.sourcePath);

            const info = path.parse(entity.sourcePath);

            entity.targetName = newName;
            entity.uri = entity.fullname.replace(info.name, newName);
            entity.targetPath = joinPath(destFolder, entity.uri);
        }
        else
        {
            entity.targetPath = joinPath(destFolder, uri);
        }

        const info = decorticatePath(entity.targetPath);
        entity.targetDir = info.dir;
        entity.originalPath = info.originalPath;

        if (minify)
        {
            entity.targetName = entity.name + ".min";
            entity.targetPathUncompressed = entity.targetPath;
            entity.targetPath = replaceLast(entity.targetPath, entity.name, entity.targetName);
            entity.uri = replaceLast(entity.uri, entity.name, entity.targetName);
        }
        else
        {
            entity.targetName = entity.targetName || info.name;
        }

        if (sourcemaps)
        {
            entity.sourcemapName = entity.name + entity.ext + ".map";
            entity.sourcemapPath = joinPath(entity.targetDir, entity.sourcemapName);
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
 * Update html file content based on entity object content
 * @param htmlContent
 * @param entity
 * @param alreadyGenerated
 * @param deployImmediately
 * @returns {Promise<null|*>}
 */
const applyChangesFromEntity = async (htmlContent, entity, {alreadyGenerated = false, deployImmediately = true} = {}) =>
{
    try
    {
        if (!deployImmediately)
        {
            return htmlContent;
        }

        if (!fs.existsSync(entity.targetDir))
        {
            fs.mkdirSync(entity.targetDir, {recursive: true});
        }

        if (!alreadyGenerated)
        {
            if (entity.code)
            {
                if (entity.sourcemapContent)
                {
                    // Write source map
                    fs.writeFileSync(entity.sourcemapPath, entity.sourcemapContent, "utf-8");

                    // Write original
                    fs.writeFileSync(entity.targetPathUncompressed, entity.originalContent, "utf-8");
                }

                // Write minified
                fs.writeFileSync(entity.targetPath, entity.code, "utf-8");
            }
            else
            {
                // Copy the corresponding file to its calculated new location
                fs.copyFileSync(entity.sourcePath, entity.targetPath);
            }
        }

        // Update the path in the html file
        htmlContent = updateHtml(htmlContent, {entity});
        reportResult({entity});
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return htmlContent;
};

const reportResult = ({sourcemaps = false, minified = false, bundled = false, entity} = {}) =>
{
    try
    {
        const properties = [];
        if (bundled)
        {
            properties.push("bundled");
        }

        if (minified)
        {
            properties.push("minified");
        }

        if (sourcemaps)
        {
            properties.push("source mapped");
        }

        let str = "";
        if (properties.length)
        {
            str = properties.join(", ") + " and ";
        }

        let sentence = `${str}copied ${entity.uri}`;
        sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
        console.log(sentence);

        return true;
    }
    catch (e)
    {
        console.error({lid: 1023}, e.message);
    }

    return false;
};

/**
 * Minify css file using cleanCss to do the minifying
 * @param solvedSourceAbsolutePath
 * @param htmlContent
 * @param sourcemaps
 * @returns {null|{content: string, htmlContent: *}}
 */
const minifyCss = async ({
                             htmlContent,
                             destFolder,
                             sourcemaps = false,
                             entity,
                             production = false
                         } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder, {production, minify: true, sourcemaps});

        const cssMinifyingOptions = {};
        if (sourcemaps)
        {
            cssMinifyingOptions.sourceMap = true;
            cssMinifyingOptions.rebaseTo = entity.targetDir;
        }

        entity.originalContent = fs.readFileSync(entity.sourcePath, "utf-8");

        // ------------
        extractEntities(entity.originalContent, {
            search      : "url\\([\"']?([^\"']+)[\"']?\\)",
            category    : CATEGORY.GENERIC,
            referenceDir: entity.sourceDir
        });
        // ------------

        const css = new CleanCSS(cssMinifyingOptions).minify(entity.originalContent);

        // css.warnings && css.warnings.length && console.log(css.warnings.join(os.EOL));
        css.errors && css.errors.length && console.log(css.errors.join(os.EOL));

        // CSS minifying was successful
        if (css && css.styles)
        {
            entity.code = css.styles;
        }

        if (production)
        {
            addProdCode({entity});
        }
        else
        {
            if (css.sourceMap)
            {
                entity.sourcemapContent = css.sourceMap.toString();
                entity.code = entity.code + os.EOL + `/*# sourceMappingURL=${entity.sourcemapName} */`;
            }
        }

        htmlContent = await applyChangesFromEntity(htmlContent, entity, {deployImmediately: !production});

    }
    catch (e)
    {
        console.error({lid: 1025}, e.message);
    }

    return {htmlContent};
};

/**
 * Minify .js using uglify-js to do the minifying
 * @param solvedSourceAbsolutePath
 * @param sourcemaps
 * @returns {{content: string}|null}
 */
const minifyJs = async ({
                            htmlContent,
                            destFolder,
                            sourcemaps = false,
                            entity,
                            production = false
                        } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder, {production, minify: true, sourcemaps});

        const jsMinifyingOptions = {};
        if (sourcemaps)
        {
            jsMinifyingOptions.sourceMap = {
                filename: entity.fullname,
                url     : entity.sourcemapName
            };
        }

        entity.originalContent = fs.readFileSync(entity.sourcePath, "utf-8");
        const result = UglifyJS.minify(entity.originalContent, jsMinifyingOptions);

        if (result.error)
        {
            console.error(result.error);
            return null;
        }

        entity.code = result.code;

        if (production)
        {
            addProdCode({content: entity.code, entity});
        }
        else
        {
            if (result.map)
            {
                entity.sourcemapContent = result.map;
            }
        }

        htmlContent = await applyChangesFromEntity(htmlContent, entity, {deployImmediately: !production});

    }
    catch (e)
    {
        console.error({lid: 1027}, e.message);
    }

    return {htmlContent};
};

const minifyEsm = async ({
                             htmlContent,
                             destFolder,
                             sourcemaps = false,
                             entity,
                             production = false
                         } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder, {production, minify: true, sourcemaps});

        const esmOptions = {
            input           : entity.sourcePath,
            noheader        : true,
            target          : TARGET.BROWSER,
            onlyBundle      : true,
            "bundle-browser": entity.targetPath,
            keepExternal    : true,
            resolveAbsolute : ["./node_modules"]
        };

        if (sourcemaps)
        {
            esmOptions.sourceMap = true;
        }

        const result = await transpileFiles(esmOptions);
        if (!result.success)
        {
            console.error(`Error during ${entity.uri} minification`);
            return null;
        }

        htmlContent = await applyChangesFromEntity(htmlContent, entity, {alreadyGenerated: true});
    }
    catch (e)
    {
        console.error({lid: 1029}, e.message);
    }

    return {htmlContent};
};

const copyGeneric = async ({
                               htmlContent,
                               destFolder,
                               entity
                           } = {}) =>
{
    try
    {
        // Add target information to the entity object
        await reviewTargetEntity(entity, destFolder);

        if (entity.sourcePath.indexOf("manifest.json") > -1)
        {
            // ------------
            const content = fs.readFileSync(entity.sourcePath, "utf-8");
            extractEntities(content, {
                search  : `"src"\\s*:\\s*"([^"]+)"`,
                category: CATEGORY.EXTRAS,
                referenceDir: entity.sourceDir
            });
            htmlContent = await applyChangesFromEntity(htmlContent, entity);
            // ------------
        }

        if (!["manifest.json"].includes(entity.fullname))
        {
            htmlContent = await applyChangesFromEntity(htmlContent, entity);
        }

        return {htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1029}, e.message);
    }

    return null;
};

/**
 * Copy an uri to the target folder
 * @param uri
 * @param entity
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param entity
 * @param destFolder
 * @param htmlContent
 * @param minify
 * @param sourcemaps
 * @returns {Promise<null|{uri, htmlContent}>}
 */
const copyEntity = async (entity, destFolder, htmlContent, {
    minify = false,
    sourcemaps = false,
    production = false
} = {}) =>
{
    try
    {
        let res;

        // Minify
        if (minify)
        {
            if (entity.category === CATEGORY.CSS)
            {
                res = await minifyCss({
                    htmlContent,
                    destFolder,
                    sourcemaps,
                    entity,
                    production
                });
            }
            else if (entity.category === CATEGORY.SCRIPT)
            {
                res = await minifyJs({
                    htmlContent,
                    destFolder,
                    sourcemaps,
                    entity,
                    production
                });
            }
            else if (entity.category === CATEGORY.ESM)
            {
                res = await minifyEsm({
                    htmlContent,
                    destFolder,
                    sourcemaps,
                    entity,
                    production
                });
            }
        }
        else
        {
            // CATEGORY.GENERIC, CATEGORY.MEDIAS, CATEGORY.EXTRAS
            res = await copyGeneric({
                htmlContent,
                destFolder,
                entity,
                production
            });
        }

        htmlContent = res.htmlContent;

    }
    catch (e)
    {
        console.error({lid: 1003}, e.message);
    }

    return {htmlContent};
};

/**
 * Copy an array of uris to the target folder
 * @param uris
 * @param category
 * @param htmlContent
 * @param outputFolder
 * @returns {Promise<string>}
 */
const copyEntities = async (category, outputFolder, {
    htmlContent = null,
    minify = false,
    sourcemaps = false,
    production = false
} = {}) =>
{
    try
    {
        const entities = getEntities(category);
        for (let i = 0; i < entities.length; ++i)
        {
            const entity = entities[i];
            const res = await copyEntity(entity, outputFolder, htmlContent, {minify, sourcemaps, production});

            if (!res)
            {
                console.log(`Failed to copy ${entity.uri} to ${outputFolder}`);
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
 * @param production
 * @returns {Promise<string|null>}
 */
const copyAssetsFromHTML = async (input, outputFolder, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false,
    production = false
} = {}) =>
{
    try
    {
        let htmlContent = fs.readFileSync(input, "utf-8");
        htmlContent = stripHtmlComments(htmlContent);

        if (minifyHtml)
        {
            htmlContent = minifierHtml(htmlContent, {
                collapseWhitespace   : true,
                continueOnParseError : true,
                keepClosingSlash     : true,
                removeAttributeQuotes: false,
                minifyCss,
                minifyJs
            });
        }

        // CSS
        htmlContent = extractEntities(htmlContent, {
            tagName      : "link",
            sourceRefName: "href",
            extraProperty: `\\bstylesheet\\b`,
            category     : CATEGORY.CSS
        });

        // GENERIC
        htmlContent = extractEntities(htmlContent, {
            tagName      : "\\w+",
            sourceRefName: "href",
            category     : CATEGORY.GENERIC
        });

        // ESM
        htmlContent = extractEntities(htmlContent, {
            tagName      : "script",
            sourceRefName: "src",
            extraProperty: `\\btype\\s*?=\\s*?["']\\s*?module\\s*?["']`,
            category     : CATEGORY.ESM
        });

        // SCRIPTS
        htmlContent = extractEntities(htmlContent, {
            tagName      : "script",
            sourceRefName: "src",
            category     : CATEGORY.SCRIPT
        });

        // MEDIAS
        htmlContent = extractEntities(htmlContent, {
            tagName      : "\\w+",
            sourceRefName: "src",
            category     : CATEGORY.MEDIAS
        });

        // INLINE CSS
        const referenceDir = path.parse(input).dir;
        extractEntities(htmlContent, {
            search  : "url\\([\"']?([^\"']+)[\"']?\\)",
            category: CATEGORY.GENERIC,
            referenceDir
        });


        htmlContent = await copyEntities(CATEGORY.CSS, outputFolder, {
            htmlContent,
            minify: minifyCss,
            sourcemaps,
            production
        });

        htmlContent = await copyEntities(CATEGORY.GENERIC, outputFolder, {htmlContent, production});
        htmlContent = await copyEntities(CATEGORY.MEDIAS, outputFolder, {htmlContent, production});

        htmlContent = await copyEntities(CATEGORY.ESM, outputFolder, {
            htmlContent,
            minify: minifyJs,
            sourcemaps,
            production
        });

        htmlContent = await copyEntities(CATEGORY.SCRIPT, outputFolder, {
            htmlContent,
            minify: minifyJs,
            sourcemaps,
            production
        });

        // Extra files discovered during process i.e. manifest.json
        await copyEntities(CATEGORY.EXTRAS, outputFolder, {htmlContent, production});

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
 * @param htmlPath
 * @param minifyHtml
 * @param minifyCss
 * @param minifyJs
 * @param sourcemaps
 * @returns {Promise<{outputFolder: (*), htmlContent: (string|null)}>}
 */
const generateBuild = async (outputFolder, htmlPath, {
    minifyHtml = false,
    minifyCss = false,
    minifyJs = false,
    sourcemaps = false,
    buildType = "staging"
} = {}) =>
{
    try
    {
        fs.mkdirSync(outputFolder, {recursive: true});

        const parsed = path.parse(htmlPath);

        if (buildType === "production")
        {
            minifyCss = true;
            minifyJs = true;
            sourcemaps = false;
        }
        else
        {
            outputFolder = path.isAbsolute(parsed.dir) ? resolvePath(outputFolder) : joinPath(outputFolder, parsed.dir);
        }

        const htmlContent = await copyAssetsFromHTML(htmlPath, outputFolder, {
            minifyHtml,
            minifyCss,
            minifyJs,
            sourcemaps,
            production: buildType === "production"
        });

        return {outputFolder, htmlContent};
    }
    catch (e)
    {
        console.error({lid: 1017}, e.message);
    }

    return null;
};

const stopServer = async ({namespace = "to-build", name = "staging"} = {}) =>
{
    try
    {
        const isServerUp = await isGenserverUp({namespace, name});
        if (isServerUp)
        {
            return await stopGenServer({namespace, name});
        }
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

/**
 * Start server
 * @param dirs
 * @param namespace
 * @param name
 * @param port
 * @param dynDirs
 * @returns {Promise<*>}
 */
const startServer = async ({dirs = [], namespace = "to-build", name = "staging", port = 10002, dynDirs = []} = {}) =>
{
    try
    {
        if (!await stopServer({namespace, name}))
        {
            console.error(`Could not stop running server. Re-using the same one`);
        }

        return await startGenServer({namespace, name, port, dirs, dynDirs});
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

/**
 * Start development server
 * @returns {Promise<boolean>}
 */
const startDevelopmentServer = async ({port = 10000} = {}) =>
{
    try
    {
        // Start server for development
        const devDirs = getRoots();
        devDirs.push(...getStaticDirs());
        if (!await startServer({name: "development", dirs: devDirs, dynDirs: ["dynamic"], port}))
        {
            console.error(`Failed to start the development server`);
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
 * Start staging server
 * @param realOutputFolder
 * @param port
 * @returns {Promise<boolean>}
 */
const startStagingServer = async (realOutputFolder, {port = 10002} = {}) =>
{
    try
    {
        // Start server for staging
        const stagingDirs = [];
        stagingDirs.push(realOutputFolder);
        stagingDirs.push(...getStaticDirs());

        if (!await startServer({name: "staging", dirs: stagingDirs, dynDirs: ["dynamic"], port}))
        {
            console.error(`Failed to start the staging server`);
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
 * Start production server
 * @param realOutputFolder
 * @param port
 * @returns {Promise<boolean>}
 */
const startProductionServer = async (realOutputFolder, {port = 10004} = {}) =>
{
    try
    {
        // Start server for production
        const productionDirs = [];
        productionDirs.push(realOutputFolder);
        productionDirs.push(...getStaticDirs());

        if (!await startServer({name: "production", dirs: productionDirs, dynDirs: ["dynamic"], port}))
        {
            console.error(`Failed to start the production server`);
        }

        return true;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return false;
};

const generateTag = (entitiesSpecificsList, outputFolder) =>
{
    try
    {
        const currentCategory = entitiesSpecificsList[0].category;
        const extension = entitiesSpecificsList[0].ext;

        let bigCode = "";
        for (let i = 0; i < entitiesSpecificsList.length; ++i)
        {
            const specificEntity = entitiesSpecificsList[i];

            bigCode += `/** ${specificEntity.pathname} */` + os.EOL;

            if (!specificEntity.code)
            {
                // Empty css
                continue;
            }

            bigCode += specificEntity.code + os.EOL + os.EOL + os.EOL;
        }

        const hash = getHashFromText(bigCode);
        const filename = hash + extension;
        const filepath = joinPath(outputFolder, filename);
        fs.writeFileSync(filepath, bigCode, "utf-8");

        if (currentCategory === CATEGORY.CSS)
        {
            return `<link rel="stylesheet" href="./${filename}"/>`;
        }
        if (currentCategory === CATEGORY.SCRIPT)
        {
            return `<script src="./${filename}"></script>`;
        }

        return `<link href="./${filename}"/> <!-- Unknown category -->`;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
};

const buildProductionTargets = ({outputFolder, htmlContent}) =>
{
    try
    {
        const htmlParts = htmlContent.split(MASKS.DELIMITER);

        let newHtml = "";
        let entitiesSpecificsList = [];
        let currentCategory = null;
        for (let i = 0; i < htmlParts.length; ++i)
        {
            let htmlPart = htmlParts[i];
            htmlPart = htmlPart.trim();

            if (!htmlPart)
            {
                continue;
            }

            const entity = getCodeTagID(htmlPart);
            if (!entity)
            {
                if (entitiesSpecificsList.length)
                {
                    newHtml += generateTag(entitiesSpecificsList, outputFolder);
                    entitiesSpecificsList = [];
                }

                newHtml += htmlPart;
                continue;
            }

            if (!currentCategory)
            {
                // Reset category
                entitiesSpecificsList = [];
                entitiesSpecificsList.push(entity);
                currentCategory = entity.category;
                continue;
            }

            if (entity.category !== currentCategory)
            {
                newHtml += generateTag(entitiesSpecificsList, outputFolder);

                // Reset category
                entitiesSpecificsList = [];
                entitiesSpecificsList.push(entity);
                currentCategory = entity.category;
                continue;
            }

            entitiesSpecificsList.push(entity);
        }

        return newHtml;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
};

const generateAllHTMLs = async (inputs, {
    root,
    outputFolder,
    minifyHtml,
    minifyCss,
    minifyJs,
    sourcemaps,
    isProduction = false
}) =>
{
    try
    {
        const buildType = isProduction ? "production" : "staging";
        outputFolder = path.join(outputFolder, buildType);
        let result;

        for (let i = 0; i < inputs.length; ++i)
        {
            const htmlPath = inputs[i];

            console.log(`Building ${buildType} for ${htmlPath}`);

            // Add the index.html file directory to the lookup root list
            const htmlInfo = path.parse(htmlPath);
            let htmlPathFolder = htmlInfo.dir;
            if (htmlPathFolder)
            {
                htmlPathFolder = resolvePath(htmlPathFolder);
            }

            // Define lookup root folders
            setRoots(htmlPathFolder, root);

            // Copy detected files in HTML source to target folder
            result = await generateBuild(outputFolder, htmlPath, {
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps,
                buildType
            });

            if (isProduction)
            {
                fs.writeFileSync("./out/production/index-debug.html", result.htmlContent, "utf-8");
                result.htmlContent = buildProductionTargets(result);
            }

            const targetHtmlPath = joinPath(result.outputFolder, htmlInfo.base);
            fs.writeFileSync(targetHtmlPath, result.htmlContent, "utf-8");

        }

        // ---------------------------------------------
        // Start servers
        // ---------------------------------------------
        if (buildType === "staging")
        {
            await startStagingServer(result.outputFolder);
        }
        else if (buildType === "production")
        {
            await startProductionServer(outputFolder);
        }

        return result;
    }
    catch (e)
    {
        console.error({lid: 1000}, e.message);
    }

    return null;
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

        if (!fs.existsSync(outputFolder))
        {
            fs.mkdirSync(outputFolder, {recursive: true});
        }

        // Grab minify options
        const minifyHtml = getBooleanOptionValue(cli, "minifyHtml", true);
        const minifyCss = getBooleanOptionValue(cli, "minifyCss", true);
        const minifyJs = getBooleanOptionValue(cli, "minifyJs", true);
        const sourcemaps = getBooleanOptionValue(cli, "sourcemaps", true);
        const development = getBooleanOptionValue(cli, "development", true);
        const staging = getBooleanOptionValue(cli, "staging", true);
        const production = getBooleanOptionValue(cli, "production", true);

        const root = cli.root;

        setStaticDirs(cli.static);

        if (development)
        {
            setRoots(null, root);
            await startDevelopmentServer();
        }

        if (staging)
        {
            await generateAllHTMLs(inputs, {
                root,
                outputFolder,
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps,
                isProduction: false
            });
        }

        if (production)
        {
            await generateAllHTMLs(inputs, {
                root,
                outputFolder,
                minifyHtml,
                minifyCss,
                minifyJs,
                sourcemaps,
                isProduction: true
            });
        }

    }
    catch (e)
    {
        console.error({lid: 1021}, e.message);
    }

    return false;

}());