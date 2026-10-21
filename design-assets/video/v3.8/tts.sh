v=$1; pitch=$2; rate=$3; tag=$4; mkdir -p vo/$tag; i=0
while IFS= read -r l; do for k in 1 2 3 4 5; do python3 -m edge_tts --voice $v --pitch=$pitch --rate=$rate --text "$l" --write-media vo/$tag/$i.mp3 >/dev/null 2>&1 && ffprobe -v error vo/$tag/$i.mp3 && break; sleep 2; done; i=$((i+1)); done < vo_lines.txt
