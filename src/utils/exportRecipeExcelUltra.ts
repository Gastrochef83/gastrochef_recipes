import ExcelJS from "exceljs"
import { saveAs } from "file-saver"

async function loadImage(url: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await blob.arrayBuffer()
  } catch {
    return null
  }
}

function styleHeader(cell:any){
  cell.font={bold:true}
  cell.alignment={vertical:"middle",horizontal:"center"}
  cell.fill={
    type:"pattern",
    pattern:"solid",
    fgColor:{argb:"FFDDE5D1"}
  }
  cell.border={
    top:{style:"thin"},
    left:{style:"thin"},
    bottom:{style:"thin"},
    right:{style:"thin"}
  }
}

function styleCell(cell:any){
  cell.border={
    top:{style:"thin"},
    left:{style:"thin"},
    bottom:{style:"thin"},
    right:{style:"thin"}
  }
}

export async function exportRecipeExcelUltra(recipe:any){

const workbook=new ExcelJS.Workbook()

/* SUMMARY */

const summary=workbook.addWorksheet("Summary")

summary.columns=[
{width:25},
{width:35}
]

summary.addRow(["Recipe",recipe.name||""])
summary.addRow(["Yield",recipe.yield||""])
summary.addRow(["Portion",recipe.portion||""])
summary.addRow(["Total Cost",recipe.total_cost||""])
summary.addRow(["Food Cost %",recipe.food_cost||""])

summary.eachRow((row)=>{
row.eachCell((cell)=>styleCell(cell))
})

/* INGREDIENTS */

const ing=workbook.addWorksheet("Ingredients")

ing.columns=[
{header:"Code",key:"code",width:15},
{header:"Ingredient",key:"ingredient",width:35},
{header:"Net",key:"net",width:10},
{header:"Unit",key:"unit",width:10},
{header:"Yield %",key:"yield",width:10},
{header:"Gross",key:"gross",width:12},
{header:"Unit Cost",key:"unit_cost",width:14},
{header:"Line Cost",key:"line_cost",width:14},
{header:"Note",key:"note",width:30}
]

ing.getRow(1).eachCell(styleHeader)

ing.views=[{state:"frozen",ySplit:1}]

ing.autoFilter={
from:"A1",
to:"I1"
}

if(recipe.lines){
recipe.lines.forEach((l:any)=>{
const r=ing.addRow({
code:l.code||"",
ingredient:l.name||l.ingredient||"",
net:l.net||"",
unit:l.unit||"",
yield:l.yield||"",
gross:l.gross||"",
unit_cost:l.unit_cost||"",
line_cost:l.line_cost||"",
note:l.note||""
})
r.eachCell(styleCell)
})
}

/* METHOD */

const method=workbook.addWorksheet("Method")

method.columns=[
{header:"Step",key:"step",width:10},
{header:"Description",key:"desc",width:100}
]

method.getRow(1).eachCell(styleHeader)

if(recipe.method){
recipe.method.forEach((m:any,i:number)=>{
const r=method.addRow({
step:i+1,
desc:m.description||""
})
r.getCell(2).alignment={wrapText:true}
})
}

/* PHOTOS */

const photos=workbook.addWorksheet("Photos")

photos.columns=[
{width:40},
{width:40},
{width:40}
]

let row=1
let col=1

if(recipe.method){

for(const step of recipe.method){

const colLetter=String.fromCharCode(64+col)

photos.getCell(`${colLetter}${row}`).value=`Step ${step.step||""}`

if(step.photo_url){

const buffer=await loadImage(step.photo_url)

if(buffer){

const img=workbook.addImage({
buffer,
extension:"jpeg"
})

photos.addImage(img,{
col:col-1+0.1,
row:row+1,
width:360,
height:240
})

}

}

photos.getCell(`${colLetter}${row+12}`).value=step.description||""
photos.getCell(`${colLetter}${row+12}`).alignment={wrapText:true}

col++

if(col>3){
col=1
row+=18
}

}

}

/* SCALE LAB */

const scale=workbook.addWorksheet("Scale Lab")

scale.columns=[
{header:"Ingredient",width:35},
{header:"Original",width:15},
{header:"x2",width:15},
{header:"x5",width:15},
{header:"x10",width:15}
]

scale.getRow(1).eachCell(styleHeader)

if(recipe.lines){

recipe.lines.forEach((l:any)=>{

const base=l.net||0

scale.addRow({
Ingredient:l.name||"",
Original:base,
x2:base*2,
x5:base*5,
x10:base*10
})

})

}

/* NUTRITION */

const nutrition=workbook.addWorksheet("Nutrition")

nutrition.columns=[
{header:"Calories",width:15},
{header:"Protein",width:15},
{header:"Fat",width:15},
{header:"Carbs",width:15}
]

nutrition.getRow(1).eachCell(styleHeader)

if(recipe.nutrition){

nutrition.addRow({
Calories:recipe.nutrition.calories||"",
Protein:recipe.nutrition.protein||"",
Fat:recipe.nutrition.fat||"",
Carbs:recipe.nutrition.carbs||""
})

}

/* EXPORT */

const buffer=await workbook.xlsx.writeBuffer()

const blob=new Blob(
[buffer],
{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
)

saveAs(blob,`${recipe.name||"recipe"}-GastroChef-Ultra.xlsx`)

}
