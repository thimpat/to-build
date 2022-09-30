

***

## Name

to-build is a quick build generator

<br/>

## Description

to-build parses an index.html in development and generates a new build from it.

<br/>

## Installation

```shell
$> npm install to-build
```

<br/>

## Usage


##### Generate builds in the ./out directory with .css and .js minified

###### Two builds were generated in two different folders:

`./out/staging` => Contains minified files + sourcemaps

`./out/production` => Contains minified files with no sourcemaps (partially flattened folder)


```shell
$> to-build src/index.html
```

<br/>


## Options

| **Options**   | **Description**                                                                                                                               | **Expect** | Default                                                         |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------|
| --development | _Only launch the server against your development folder_                                                                                      | boolean    |                                                                 |
| --staging     | _Do a build for staging_                                                                                                                      | boolean    |                                                                 |
| --production  | _Do a build for production_                                                                                                                   | boolean    |                                                                 |
| --all         | _Do a build for staging and production at once_                                                                                               | boolean    |                                                                 |
| --noserver    | _Do not run servers after builds_                                                                                                             | boolean    |                                                                 |
| --output      | _The folder to hold the build_                                                                                                                | string     |                                                                 |
| --root        | _Folders the engine will look up to, to resolve extracted uris <br/>including the current working <br/>directory and the node_modules folder_ | string[]   | [<current working dir><br/>, user defined<br/>, <node_modules>] |
| --static      | _Extra Folders the engine will look up to, to resolve extracted uris if not found in the --root ones_                                         | string[]   |                                                                 |
| --minifyCss   | _Whether to minify css_                                                                                                                       | boolean    |                                                                 |
| --minifyJs    | _Whether to minify js_                                                                                                                        | boolean    |                                                                 |
| --minifyHtml  | _Whether to minify html_                                                                                                                      | boolean    |                                                                 |
| --sourcemaps  | _Whether to generate sourcemaps_                                                                                                              | boolean    |                                                                 |

* Sourcemaps are not generated in production


<br/>


## Servers

By default, the development server runs on port 10000, staging on port 10002 and production on port 10004.

**To have a quick report:**

```shell
$> npx genserve scan --namespace to-build
```

**To edit ports, locate the configuration file with:**

```shell
# To get the servers configuration path 
$> npx genserve path servers --namespace to-build
```

**To stop servers**

```shell
$> npx genserve stop all --namespace to-build
```



## Examples



##### Generate build in a folder called "target"


```shell
$> to-build src/index.html --output target
```

<br/>

##### Generate build with no source map
```shell
$> to-build src/index.html --sourcemaps false
```
<br/>

##### Generate build with non-minified css
```shell
$> to-build src/index.html --minifyCss false
```
<br/>

##### Generate build with non-minified html
```shell
$> to-build src/index.html --minifyHtml false
```

<br/>

##### Generate build with non-minified js
```shell
$> to-build src/index.html --minifyJs false
```

<br/>

##### Generate build only for production

```shell
$> to-build src/index.html --production
```

<br/>

##### Generate build only for staging

```shell
$> to-build src/index.html --staging
```

<br/>

##### Generate build only for development

```shell
$> to-build src/index.html --development
```

<br/>





