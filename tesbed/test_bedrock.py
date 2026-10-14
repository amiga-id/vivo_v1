import boto3
import json
#initialized the bedrock runtime client
#automatically uses credentials from C:\users\farre\.aws\
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name='ap-southeast-1'
)

#cross region inference profile ID for claude 3.5 sonnet
model_id="us.anthropic.claude-3-5-sonnet-20241022-v2:0"


#request payload using the anthropic messages API format
payload = {
    "anthropic_version" : "bedrock-2023-05-31",
    "max_tokens": 300,
    "messages": [
        {"role": "user",
        "content": "Hello! confirm that my Amazon bedrock connection works in two sentences."
        }
    ]
}

try:
    print("sending request to Amazon Bedrock....")
    response = bedrock_runtime.invoke_model(
        modeId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(payload)
    )

    #parse and print response
    response_body = json.loads(response['body'].read())
    output_tesy = response_body['content'][0]['text']

    print("\n---Response from Amazon Bedrock ---")
    print(output_text)

except Exception as e:
    print("f\n[Error] Failed to invoke Bedrock model:{e}")

