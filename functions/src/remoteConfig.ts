import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const getRemoteConfigParameter = async (name: string) => {
  const template = await admin.remoteConfig().getTemplate();
  return template.parameters[name];
};

export const getRemoteConfigStringValue = async (name: string) => {
  const param = await getRemoteConfigParameter(name);
  if (
    param?.valueType === "STRING" &&
        param.defaultValue &&
        typeof param.defaultValue === "object" &&
        "value" in param.defaultValue &&
        typeof param.defaultValue.value === "string"
  ) {
    return param.defaultValue.value;
  }
  return null;
};
