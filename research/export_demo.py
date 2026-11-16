"""Offline synthetic pilot export only; no participant ingestion or live services.
python -m research.export_demo --output private_data/research-demo --count 16
"""
import argparse,csv,json
from pathlib import Path
from .preview import SyntheticEvent,assignment

def export(output,count=16,seed=42):
    if not 1<=count<=1000:raise ValueError('Export 1 to 1000 test rows')
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    rows=[SyntheticEvent(sample_slot=i,scenario_id='comfortable',condition=assignment(i,seed),event='condition_shown',decision_time_ms=0).model_dump() for i in range(count)]
    (output/'synthetic-events.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
    with (output/'synthetic-events.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    return rows

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True);parser.add_argument('--count',type=int,default=16);parser.add_argument('--seed',type=int,default=42)
    args=parser.parse_args();export(args.output,args.count,args.seed);print('Exported explicitly synthetic pilot rows only')
