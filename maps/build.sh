# depends on inkscape to generate PNG versions

ROOMS_IDS=`cat rooms.json|cut -d ":" -f 2|cut -d "," -f 1|cut -d '"' -f 2|grep -v "{"|grep -v "}"`
ROOMS_SVG=`for i in $ROOMS_IDS; do echo "$i.svg" ; done`

for i in $ROOMS_SVG
do cat Santa_Clara_Marriott_Map.svg |sed -e 's/"text\/css">/"text\/css">#'`basename $i .svg`' { fill: yellow;}/' > $i; inkscape $i -e ../node.js/public/maps/`basename $i .svg`.png 2>/dev/null ; rm $i
done

cp Santa_Clara_Marriott_Map.svg ../node.js/public/maps/main.svg