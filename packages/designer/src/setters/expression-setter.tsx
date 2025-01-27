import React, { useState, useEffect, useCallback } from 'react';
import { Box, css } from 'coral-system';
import { Modal } from 'antd';
import { value2code, isValidExpressionCode } from '@music163/tango-core';
import {
  isVariableString,
  getVariableContent,
  noop,
  useBoolean,
  getValue,
} from '@music163/tango-helpers';
import { CloseCircleFilled, ExpandAltOutlined } from '@ant-design/icons';
import { IconButton, Panel, InputCode } from '@music163/tango-ui';
import { FormItemComponentProps } from '@music163/tango-setting-form';
import { useWorkspace, useWorkspaceData } from '@music163/tango-context';
import { EditableVariableTree, IVariableTreeNode } from '../components';
import { useSandboxQuery } from '../context';

export const expressionValueValidate = (value: string) => {
  if (isVariableString(value)) {
    const exp = getVariableContent(value);
    if (!isValidExpressionCode(exp)) {
      return '表达式存在语法错误！';
    }
  }
};

export const jsonValueValidate = (value: string) => {
  if (isVariableString(value)) {
    const jsonStr = getVariableContent(value);
    try {
      JSON.parse(jsonStr);
    } catch (e) {
      return '不是合法的 JSON 语法！';
    }
  }
};

// FIXME: 这里应该用原始的代码 raw value
export const getInputValue = (val: any) => {
  if (!val) return '';

  let ret;

  switch (typeof val) {
    case 'string':
      ret = val;
      break;
    case 'number':
      ret = String(val);
      break;
    case 'object':
      ret = value2code(val);
      ret = `{${ret}}`;
      break;
    default:
      ret = '';
      break;
  }

  return ret;
};

const suffixStyle = css`
  .anticon-close-circle {
    color: rgba(0, 0, 0, 0.25);
    &:hover {
      color: rgba(0, 0, 0, 0.45);
    }
  }
`;

export interface ExpressionSetterProps extends FormItemComponentProps<string> {
  modalTitle?: string;
  modalTip?: string;
  autoCompleteOptions?: string[];
  allowClear?: boolean;
}

export function ExpressionSetter(props: ExpressionSetterProps) {
  const {
    onChange,
    modalTitle,
    modalTip,
    autoCompleteOptions,
    placeholder = '表达式请使用 {} 包裹',
    value: valueProp,
    status,
    allowClear = true,
  } = props;
  const [visible, { on, off }] = useBoolean();
  const [inputValue, setInputValue] = useState(() => {
    return getInputValue(valueProp);
  });
  const sandbox = useSandboxQuery();
  const evaluateContext = sandbox.window;

  // when receive new value, sync state
  useEffect(() => {
    setInputValue(getInputValue(valueProp));
  }, [valueProp]);

  const change = (code: string) => {
    if (!code) {
      code = undefined;
    }

    if (code !== valueProp) {
      onChange(code);
    }
  };

  return (
    <Box className="ExpressionSetter">
      <InputCode
        placeholder={placeholder}
        suffix={
          <Box css={suffixStyle}>
            {allowClear && (
              <CloseCircleFilled
                title="清空"
                onClick={() => {
                  change('');
                }}
              />
            )}
            <IconButton
              tooltip="打开表达式变量选择面板"
              icon={<ExpandAltOutlined />}
              onClick={on}
            />
          </Box>
        }
        value={inputValue}
        onChange={setInputValue}
        onBlur={() => {
          change(inputValue);
        }}
        autoCompleteContext={evaluateContext}
        autoCompleteOptions={autoCompleteOptions}
        status={status}
        maxHeight="200px"
      />
      <ExpressionModal
        title={modalTitle}
        subTitle={modalTip}
        placeholder={placeholder}
        autoCompleteOptions={autoCompleteOptions}
        visible={visible}
        defaultValue={inputValue}
        onCancel={() => off()}
        onOk={(value) => {
          onChange(value);
          off();
        }}
      />
    </Box>
  );
}

export interface ExpressionModalProps {
  title?: string;
  subTitle?: string;
  placeholder?: string;
  visible?: boolean;
  defaultValue?: string;
  onCancel?: () => void;
  onOk?: (value: string) => void;
  dataSource?: IVariableTreeNode[];
  autoCompleteOptions?: string[];
}

export function ExpressionModal({
  title,
  subTitle,
  placeholder,
  visible,
  onCancel = noop,
  onOk = noop,
  defaultValue,
  dataSource,
  autoCompleteOptions,
}: ExpressionModalProps) {
  const [exp, setExp] = useState(defaultValue);
  const workspace = useWorkspace();
  const onAction = useCallback(
    (action: string, args: unknown[]) => {
      workspace[action]?.(...args);
    },
    [workspace],
  );
  const sandbox = useSandboxQuery();
  const { expressionVariables } = useWorkspaceData();
  const evaluateContext = sandbox.window;

  const handleExpInputChange = (val: string) => {
    setExp(val?.trim());
  };
  return (
    <Modal
      closable={false}
      destroyOnClose
      width="70%"
      open={visible}
      onCancel={onCancel}
      onOk={() => {
        onOk(exp);
      }}
    >
      <Panel title={`将 ${title} 设置为引用变量或自定义表达式`} subTitle={subTitle} shape="solid">
        <InputCode
          shape="inset"
          minHeight="56px"
          maxHeight="200px"
          value={exp}
          placeholder={placeholder}
          onChange={handleExpInputChange}
          autoCompleteContext={evaluateContext}
          autoCompleteOptions={autoCompleteOptions}
        />
      </Panel>
      <Panel title="从变量列表中选中" shape="solid" borderTop="0" maxHeight={400} overflow="auto">
        <EditableVariableTree
          dataSource={dataSource || expressionVariables}
          onSelect={(node) => {
            if (!node.key) {
              return;
            }
            if (node.key.split('.').length < 2) {
              return;
            }
            let str;
            if (/^(stores|services)\./.test(node.key)) {
              str = `{tango.${node.key.replaceAll('.', '?.')}}`;
            } else {
              str = `{${node.key}}`;
            }
            setExp(str);
          }}
          onAddVariable={(storeName, data) => {
            onAction('addStoreState', [storeName, data.name, data.initialValue]);
          }}
          onDeleteVariable={(storeName, stateName) => {
            onAction('removeStoreState', [storeName, stateName]);
          }}
          onDeleteStore={(storeName) => {
            onAction('removeStoreModule', [storeName]);
          }}
          onSave={(code, node) => {
            onAction('updateModuleCodeByVariablePath', [node.key, code]);
          }}
          getPreviewValue={(node) => {
            if (!node || !node.key) {
              return;
            }

            if (node.type === 'function') {
              return node.raw;
            }

            return getValue(evaluateContext['tango'], node.key);
          }}
        />
      </Panel>
    </Modal>
  );
}
