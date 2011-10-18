# depends on inkscape to generate PNG versions
DESTDIR="$2"

if [ ! -d "$DESTDIR" ] ; then mkdir "$DESTDIR" ; fi

if [ ! -d "$DESTDIR" ] ; then echo "$DESTDIR doesn't exist and couldn't be created" ; exit 1; fi

ROOMS_IDS=`cat rooms.json|cut -d ":" -f 2|cut -d "," -f 1|cut -d '"' -f 2|grep -v "\["|grep -v "\]"`
ROOMS_SVG=`for i in $ROOMS_IDS; do echo "$i.svg" ; done`

for i in $ROOMS_SVG
do cat "$1" |sed -e 's/"text\/css">/"text\/css">#'`basename $i .svg`' { fill: yellow;}/' > $i; inkscape $i -e "$DESTDIR"/`basename $i .svg`.png 2>/dev/null ; rm $i
done

cp "$1" "$DESTDIR"/main.svg
inkscape "$DESTDIR"/main.svg -e "$DESTDIR"/maps/main.png
