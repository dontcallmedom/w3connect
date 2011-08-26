ROOMS_SVG=`for i in \`cat rooms.json|cut -d ":" -f 1|cut -d '"' -f 2|grep -v "{"|grep -v "}"\`; do echo "$i.svg" ; done`

for i in $ROOMS_SVG:
do cat Santa_Clara_Marriott_Map.svg |sed -e 's/"text\/css">/"text\/css">#'`basename $i .svg`' { fill: yellow;}/' > $i; inkscape $i -e ../node.js/public/maps/`basename $i .svg`.png ; rm $i
done