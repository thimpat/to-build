

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

## Note

> to-build is at an experimental level

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

| **Options**   | **Description**                                          | **Expect** |
|---------------|----------------------------------------------------------|------------|
| --development | _Only launch the server against your development folder_ | boolean    |
| --staging     | _Do a build for staging_                                 | boolean    |
| --production  | _Do a build for production_                              | boolean    |
| --all         | _Do a build for staging and production at once_          | boolean    |
| --noserver    | _Do not run servers after builds_                        | boolean    |  
| --output      | _The folder to hold the build_                           | string     |  
| --static      | _Folder for assets or public_                            | string     |  
| --root        | _Extra folders to resolve paths_                         | string     |  
| --minifyCss   | _Whether to minify css_                                  | boolean    |  
| --minifyJs    | _Whether to minify js_                                   | boolean    |  
| --minifyHtml  | _Whether to minify html_                                 | boolean    |  



<br/>


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





