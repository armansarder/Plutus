"""Explicit fictional history for the public demo, never a Nessie fallback."""
from datetime import datetime,timezone,timedelta

class DemoHistory:
    source_label='Fictional Demo history; synthetic records, not Nessie API responses.'
    def load_raw(self):
        today=datetime.now(timezone.utc).date();month=today.replace(day=1)
        raw={'customer_id':'synthetic_demo','accounts':[{'_id':'demo_checking','customer_id':'synthetic_demo','type':'Checking'}],
             'purchases':[],'deposits':[],'bills':[],'withdrawals':[],'transfers':[],
             'merchants':[{'_id':key,'name':'Fictional '+key,'category':[key]} for key in ('groceries','transport','shopping')]}
        for i in range(6):
            for key,amount in [('groceries','80.00'),('transport','30.00'),('shopping','50.00')]:
                raw['purchases'].append({'_id':f'demo_{i}_{key}','purchase_date':month.isoformat(),'amount':amount,'status':'completed','merchant_id':key,'_source_account_id':'demo_checking','_source_account_type':'Checking','description':'Fictional demo purchase'})
            raw['deposits'].append({'_id':f'demo_income_{i}','transaction_date':month.isoformat(),'amount':'1000.00','status':'completed','_source_account_id':'demo_checking','_source_account_type':'Checking','description':'Fictional demo income'})
            month=(month-timedelta(days=1)).replace(day=1)
        return raw
