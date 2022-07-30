
## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

***

## Name

to-build is a quick build generator

<br/>

## Description

to-build parses an index.html in development and generate a new build from it.

<br/>

## Installation

```shell
$> npm install to-build
```


## Usage



##### Generate build with source maps in the ./out directory (Everything minified)
```shell
$> to-build src/index.html
```

<br/>


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


